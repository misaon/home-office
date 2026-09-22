import type { RunnerLine } from "@ho/core";
import type { RuntimeEvent, SessionId } from "@ho/protocol";
import { appendFile, chmod, mkdir, readdir, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redactSecrets, SECRET_MIN_CHARS } from "./trace-redaction.ts";
import { idleWaitSeconds, masksExitCode } from "./waste.ts";

export type TraceLine = RunnerLine | { stream: "stdin"; text: string };

export type TraceCounters = {
  lines: number;
  toolCalls: Record<string, number>;
  toolErrors: number;
  rateLimits: number;
  runtimeErrors: number;
  mcpCalls: number;
  mcpRejections: number;
  toolMs: number;
  idleWaits: number;
  idleWaitSeconds: number;
  maskedChecks: number;
  backgroundTasks: number;
};

type TraceRecord = Record<string, unknown> & { kind: string };

type Open = {
  path: string;
  sink: Bun.FileSink;
  header: Record<string, unknown>;
  summary: Record<string, unknown>;
  counters: TraceCounters;
  secrets: Set<string>;
  pending: Map<string, { name: string; at: number }>;
};

const INDEX_FILE = "index.jsonl";
const ARTIFACTS_DIR = "artifacts";
const RECORDED_EVENTS = new Set<RuntimeEvent["kind"]>([
  "init",
  "usage",
  "context",
  "rate_limited",
  "result",
  "error",
  "permission_request",
  "background_done",
  "steer",
  "reminder",
]);
const SUFFIX = ".jsonl";
const DAY_MS = 24 * 60 * 60 * 1000;
const partialDelta = (text: string): boolean =>
  (text.startsWith('{"type":"stream_event"') && !text.includes('"type":"message_delta"')) ||
  text.includes('"sessionUpdate":"agent_message_chunk"');

const freshCounters = (): TraceCounters => ({
  lines: 0,
  toolCalls: {},
  toolErrors: 0,
  rateLimits: 0,
  runtimeErrors: 0,
  mcpCalls: 0,
  mcpRejections: 0,
  toolMs: 0,
  idleWaits: 0,
  idleWaitSeconds: 0,
  maskedChecks: 0,
  backgroundTasks: 0,
});

const settle = (result: number | Promise<number>): void => {
  if (result instanceof Promise) {
    result.catch(() => undefined);
  }
};

export class TraceStore {
  readonly #dir: string;
  readonly #open = new Map<SessionId, Open>();

  constructor(home: string) {
    this.#dir = join(home, "traces");
  }

  get dir(): string {
    return this.#dir;
  }

  async init(): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
  }

  pathOf(sessionId: SessionId): string {
    return join(this.#dir, `${sessionId}${SUFFIX}`);
  }

  open(sessionId: SessionId, header: Record<string, unknown>): void {
    const path = this.pathOf(sessionId);
    const open: Open = {
      path,
      sink: Bun.file(path).writer(),
      header,
      summary: {},
      counters: freshCounters(),
      secrets: new Set(),
      pending: new Map(),
    };
    this.#open.set(sessionId, open);
    this.#emit(open, { kind: "open", ...header });
    void chmod(path, 0o600).catch(() => undefined);
  }

  protect(sessionId: SessionId, values: readonly string[]): void {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return;
    }
    for (const value of values) {
      if (value.length >= SECRET_MIN_CHARS) {
        open.secrets.add(value);
      }
    }
  }

  write(sessionId: SessionId, record: TraceRecord, remember = false): void {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return;
    }
    if (remember) {
      const { kind, ...rest } = record;
      open.summary[kind] = rest;
    }
    this.#emit(open, record);
  }

  tap(sessionId: SessionId, line: TraceLine): void {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return;
    }
    if (line.stream === "exit") {
      this.#emit(open, { kind: "line", stream: "exit", code: line.code });
      return;
    }
    if (line.stream === "stdout" && partialDelta(line.text)) {
      return;
    }
    open.counters.lines += 1;
    this.#emit(open, { kind: "line", stream: line.stream, text: line.text });
  }

  observe(sessionId: SessionId, event: RuntimeEvent): void {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return;
    }
    const { counters } = open;
    if (event.kind === "tool_call") {
      counters.toolCalls[event.name] = (counters.toolCalls[event.name] ?? 0) + 1;
      open.pending.set(event.id, { name: event.name, at: Date.now() });
      const seconds = idleWaitSeconds(event.name, event.input);
      if (seconds > 0) {
        counters.idleWaits += 1;
        counters.idleWaitSeconds += seconds;
      }
      if (masksExitCode(event.name, event.input)) {
        counters.maskedChecks += 1;
      }
      return;
    }
    if (event.kind === "tool_result") {
      if (!event.ok) {
        counters.toolErrors += 1;
      }
      const started = open.pending.get(event.id);
      if (started !== undefined) {
        open.pending.delete(event.id);
        const ms = Date.now() - started.at;
        counters.toolMs += ms;
        this.#emit(open, { kind: "tool", id: event.id, tool: started.name, ok: event.ok, ms });
      }
      return;
    }
    if (event.kind === "rate_limited") {
      counters.rateLimits += 1;
    } else if (event.kind === "error") {
      counters.runtimeErrors += 1;
    } else if (event.kind === "background_done") {
      counters.backgroundTasks += 1;
    }
    if (RECORDED_EVENTS.has(event.kind)) {
      this.#emit(open, { kind: "event", event });
    }
  }

  async writeArtifact(sessionId: SessionId, name: string, text: string): Promise<string | null> {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return null;
    }
    const dir = join(this.#dir, ARTIFACTS_DIR, sessionId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, name);
    await Bun.write(path, redactSecrets(text, open.secrets));
    await chmod(path, 0o600).catch(() => undefined);
    return path;
  }

  mcp(
    sessionId: SessionId,
    record: { tool: string; ok: boolean; ms: number; error?: string },
  ): void {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return;
    }
    open.counters.mcpCalls += 1;
    if (!record.ok) {
      open.counters.mcpRejections += 1;
    }
    this.#emit(open, { kind: "mcp", ...record });
  }

  async close(
    sessionId: SessionId,
    footer: Record<string, unknown>,
  ): Promise<TraceCounters | null> {
    const open = this.#open.get(sessionId);
    if (open === undefined) {
      return null;
    }
    this.#open.delete(sessionId);
    this.#emit(open, { kind: "end", ...footer, counters: open.counters });
    await open.sink.end();
    const summary = {
      ...open.header,
      ...open.summary,
      ...footer,
      counters: open.counters,
      trace: open.path,
    };
    await appendFile(
      join(this.#dir, INDEX_FILE),
      `${redactSecrets(JSON.stringify(summary), open.secrets)}\n`,
      { mode: 0o600 },
    );
    return open.counters;
  }

  async prune(days: number): Promise<number> {
    const cutoff = Date.now() - days * DAY_MS;
    const live = new Set([...this.#open.values()].map((open) => open.path));
    let removed = 0;
    for (const name of await readdir(this.#dir).catch((): string[] => [])) {
      const path = join(this.#dir, name);
      if (
        name === INDEX_FILE ||
        name === ARTIFACTS_DIR ||
        !name.endsWith(SUFFIX) ||
        live.has(path)
      ) {
        continue;
      }
      const info = await stat(path).catch(() => null);
      if (info !== null && info.mtimeMs < cutoff) {
        await unlink(path).catch(() => undefined);
        removed += 1;
      }
    }
    const artifacts = join(this.#dir, ARTIFACTS_DIR);
    const openIds = new Set<string>(this.#open.keys());
    for (const name of await readdir(artifacts).catch((): string[] => [])) {
      const path = join(artifacts, name);
      const info = await stat(path).catch(() => null);
      if (info !== null && info.mtimeMs < cutoff && !openIds.has(name)) {
        await rm(path, { recursive: true, force: true }).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }

  #emit(open: Open, record: Record<string, unknown>): void {
    const line = JSON.stringify({ at: new Date().toISOString(), ...record });
    settle(open.sink.write(`${redactSecrets(line, open.secrets)}\n`));
    settle(open.sink.flush());
  }
}
