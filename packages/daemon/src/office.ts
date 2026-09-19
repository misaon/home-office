import {
  applyEvent,
  type Clock,
  type CommandContext,
  type CommandResult,
  createIdFactory,
  createReadModel,
  type EventStore,
  type IdFactory,
  type ReadModel,
  type ReplayProblem,
} from "@ho/core";
import type { Actor, StoredEvent } from "@ho/protocol";
import { openEventStore } from "@ho/store";
import { join } from "node:path";
import { DomainFailureError } from "./domain-failure.ts";
import { AttachmentStore } from "./attachments.ts";
import type { Logger } from "./logger.ts";
import { TraceStore } from "./traces.ts";

const DB_FILE = "ho.db";

const SUBJECT_KEYS = new Set([
  "taskId",
  "sessionId",
  "projectId",
  "agentId",
  "threadId",
  "to",
  "reason",
]);

const SUBJECT_MAX = 200;

const idOf = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("id" in value)) {
    return undefined;
  }
  return value.id;
};

const subjectOf = (event: StoredEvent): Record<string, unknown> => {
  const subject: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(event.payload)) {
    const nested = idOf(value);
    if (nested !== undefined) {
      subject[name] = nested;
      continue;
    }
    if (SUBJECT_KEYS.has(name)) {
      subject[name] = typeof value === "string" ? value.slice(0, SUBJECT_MAX) : value;
    }
  }
  return subject;
};

export class Office {
  readonly model: ReadModel = createReadModel();
  readonly ids: IdFactory;
  readonly store: EventStore;
  readonly clock: Clock;
  readonly #log: Logger;
  #commands: Promise<unknown> = Promise.resolve();

  constructor(store: EventStore, ids: IdFactory, clock: Clock, log: Logger) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
    this.#log = log;
  }

  execute<T>(
    actor: Actor,
    command: (model: ReadModel, ctx: CommandContext) => CommandResult<T>,
  ): Promise<T> {
    const result = this.#commands.then(() => this.#execute(actor, command));
    this.#commands = result.catch(() => undefined);
    return result;
  }

  async #execute<T>(
    actor: Actor,
    command: (model: ReadModel, ctx: CommandContext) => CommandResult<T>,
  ): Promise<T> {
    const ctx: CommandContext = { ids: this.ids, now: this.clock.now().toISOString(), actor };
    const result = command(this.model, ctx);
    if (!result.ok) {
      throw new DomainFailureError(result.error);
    }
    const stored = await this.store.append(result.value.events);
    for (const event of stored) {
      applyEvent(this.model, event);
    }
    if (this.#log.isLevelEnabled("debug")) {
      for (const event of stored) {
        this.#log.debug(
          { seq: event.seq, actor: event.actor.kind, ...subjectOf(event) },
          `event ${event.type}`,
        );
      }
    }
    return result.value.read(this.model);
  }
}

const unreadable = (path: string, problems: readonly ReplayProblem[]): string => {
  const grouped = new Map<string, { count: number; first: ReplayProblem }>();
  for (const problem of problems) {
    const key = `${problem.type}: ${problem.reason}`;
    const seen = grouped.get(key);
    grouped.set(key, { count: (seen?.count ?? 0) + 1, first: seen?.first ?? problem });
  }
  const lines = [...grouped.entries()].map(
    ([key, { count, first }]) =>
      `  ${String(count)}x from seq ${String(first.seq)} (${first.at}) — ${key}`,
  );
  return [
    `Cannot replay the event log: ${String(problems.length)} of its events do not match the schema this build understands.`,
    ...lines,
    `The log at ${path} is preserved and untouched. Add a migration in packages/protocol/src/upcast.ts so these events can be read, restore ${DB_FILE} from a backup, or — if this history is expendable — move ${DB_FILE}, ${DB_FILE}-wal and ${DB_FILE}-shm aside and start with an empty log.`,
  ].join("\n");
};

export async function openOffice(
  home: string,
  clock: Clock,
  log: Logger,
): Promise<{
  office: Office;
  attachments: AttachmentStore;
  traces: TraceStore;
  close: () => void;
}> {
  const attachments = new AttachmentStore(home);
  await attachments.init();
  const traces = new TraceStore(home);
  await traces.init();
  const ids = createIdFactory(clock, {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  });
  const path = join(home, DB_FILE);
  const store = await openEventStore(path, { ids, clock });
  const office = new Office(store, ids, clock, log);
  const problems: ReplayProblem[] = [];
  try {
    let count = 0;
    for await (const event of store.read(undefined, (problem) => {
      problems.push(problem);
    })) {
      applyEvent(office.model, event);
      count += 1;
    }
    log.info({ events: count, lastSeq: office.model.lastSeq }, "read model rebuilt");
  } catch (error) {
    store.close();
    throw new Error(`Cannot read the event log at ${path}.`, { cause: error });
  }
  if (problems.length > 0) {
    store.close();
    throw new Error(unreadable(path, problems));
  }
  return { office, attachments, traces, close: store.close };
}

export function followEvents(
  office: Office,
  types: readonly StoredEvent["type"][],
  handler: (event: StoredEvent) => Promise<void> | void,
  log: Logger,
  what: string,
): { stop: () => Promise<void> } {
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  const listening = (async () => {
    for await (const event of office.store.subscribe({ types }, controller.signal)) {
      const work = Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) => {
          log.warn({ err: String(error), type: event.type }, `${what} failed`);
        })
        .finally(() => {
          pending.delete(work);
        });
      pending.add(work);
    }
  })().catch((error: unknown) => {
    log.error({ err: String(error) }, `${what} subscription failed`);
  });
  return {
    stop: async () => {
      controller.abort();
      await listening;
      await Promise.allSettled(pending);
    },
  };
}
