import { type Cancellation, createChannel, type RunnerChannel, type RunnerLine } from "@ho/core";
import { compact, type SessionId } from "@ho/protocol";
import { FromRunner, RUNNER_PATH, type ToRunner } from "@ho/protocol/runner";
import type { Logger } from "./logger.ts";
import { bearerToken, mintToken } from "./token.ts";
import type { TraceLine } from "./traces.ts";

export type RunnerConnection = {
  uid: number;
  channel: RunnerChannel;
  terminate: () => Promise<void>;
};
export type RunnerSocket = { send: (data: string) => unknown; close: () => void };
export type RunnerSocketData = { kind: "runner"; token: string };
type RunnerTap = (sessionId: SessionId, line: TraceLine) => void;

type Pending = {
  sessionId: SessionId;
  settle: PromiseWithResolvers<RunnerConnection>;
  dispose: () => void;
};
type Live = {
  sessionId: SessionId;
  socket: RunnerSocket;
  lines: ReturnType<typeof createChannel<RunnerLine>>;
  spawned: PromiseWithResolvers<void> | null;
  exited: PromiseWithResolvers<void>;
  hello: boolean;
  stderrTail: string;
};

const parseFrame = (raw: string | Buffer | Uint8Array): FromRunner | null => {
  try {
    const parsed = FromRunner.safeParse(
      JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const CONNECT_TIMEOUT_MS = 30_000;
const SPAWN_TIMEOUT_MS = 15_000;
const TERMINATE_STEP_MS = 5000;
const STDERR_TAIL_CHARS = 600;
const APPENDIX_FLAG = "--append-system-prompt";

const redactArgv = (argv: readonly string[]): string[] =>
  argv.map((part, index) =>
    index > 0 && argv[index - 1] === APPENDIX_FLAG
      ? `<${String(part.length)} chars>`
      : part.replaceAll(/Bearer [^"\s]+/gu, "Bearer ***"),
  );

export class RunnerGateway {
  readonly #pending = new Map<string, Pending>();
  readonly #live = new Map<string, Live>();
  readonly #log: Logger;
  readonly #tap: RunnerTap | null;

  constructor(log: Logger, tap: RunnerTap | null = null) {
    this.#log = log;
    this.#tap = tap;
  }

  issue(
    sessionId: SessionId,
    signal?: Cancellation,
  ): { token: string; connected: Promise<RunnerConnection>; cancel: () => void } {
    const token = mintToken();
    const settle = Promise.withResolvers<RunnerConnection>();
    const cancel = (): void => {
      const pending = this.#pending.get(token);
      if (pending !== undefined) {
        this.#pending.delete(token);
        pending.dispose();
        pending.settle.reject(new Error("runner connection cancelled or timed out"));
      }
      this.close(token, "cancelled by the office");
    };
    const timer = setTimeout(cancel, CONNECT_TIMEOUT_MS);
    signal?.addEventListener("abort", cancel);
    this.#pending.set(token, {
      sessionId,
      settle,
      dispose: () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      },
    });
    if (signal?.aborted === true) {
      cancel();
    }
    void settle.promise.catch(() => undefined);
    return { token, connected: settle.promise, cancel };
  }

  authorize(req: Request): string | null {
    const token = bearerToken(req);
    return token !== null && this.#pending.has(token) ? token : null;
  }

  open(token: string, socket: RunnerSocket): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) {
      socket.close();
      return;
    }
    const lines = createChannel<RunnerLine>(undefined, {
      onClose: () => {
        this.close(token, "line channel closed");
      },
    });
    this.#live.set(token, {
      sessionId: pending.sessionId,
      socket,
      lines,
      spawned: null,
      exited: Promise.withResolvers<void>(),
      hello: false,
      stderrTail: "",
    });
    this.#log.debug({ sessionId: pending.sessionId }, "runner connected");
  }

  message(token: string, raw: string | Buffer | Uint8Array): void {
    const live = this.#live.get(token);
    if (live === undefined) {
      return;
    }
    const parsed = parseFrame(raw);
    if (parsed === null || live.hello !== (parsed.type !== "hello")) {
      this.#log.warn({ sessionId: live.sessionId }, "invalid runner message");
      this.close(token, "invalid message");
      return;
    }
    const message = parsed;
    switch (message.type) {
      case "hello": {
        live.hello = true;
        this.#settle(token, live, message.uid);
        break;
      }
      case "spawned": {
        live.spawned?.resolve();
        break;
      }
      case "stdout": {
        this.#push(live, { stream: "stdout", text: message.text });
        break;
      }
      case "stderr": {
        live.stderrTail = (live.stderrTail + message.text).slice(-STDERR_TAIL_CHARS);
        this.#push(live, { stream: "stderr", text: message.text });
        break;
      }
      case "exit": {
        live.spawned?.reject(new Error("runner child exited before spawning"));
        this.#push(live, {
          stream: "exit",
          code: message.code,
          stderrTail: live.stderrTail === "" ? "" : `: ${live.stderrTail.trim()}`,
        });
        live.exited.resolve();
        break;
      }
      case "error": {
        live.spawned?.reject(new Error(message.message));
        this.#log.warn(
          { sessionId: live.sessionId, err: message.message },
          "runner reported an error",
        );
        this.#push(live, { stream: "stderr", text: `runner: ${message.message}` });
        break;
      }
    }
  }

  close(token: string, why = "closed"): void {
    const live = this.#live.get(token);
    this.#live.delete(token);
    if (live === undefined) {
      return;
    }
    this.#log.debug(
      { sessionId: live.sessionId, why, awaitingSpawn: live.spawned !== null },
      "runner connection closed",
    );
    const pending = this.#pending.get(token);
    if (pending !== undefined) {
      this.#pending.delete(token);
      pending.dispose();
      pending.settle.reject(new Error("runner disconnected before hello"));
    }
    live.spawned?.reject(new Error("runner disconnected before spawning"));
    live.lines.push({ stream: "exit", code: null, stderrTail: "" });
    live.exited.resolve();
    live.lines.close();
    live.socket.close();
  }

  static readonly path = RUNNER_PATH;

  #push(live: Live, line: RunnerLine): void {
    this.#tap?.(live.sessionId, line);
    live.lines.push(line);
  }

  #settle(token: string, live: Live, uid: number): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) {
      this.close(token, "no pending session for this runner");
      return;
    }
    this.#pending.delete(token);
    pending.dispose();
    const send = (message: ToRunner): void => {
      if (message.type === "stdin") {
        this.#tap?.(live.sessionId, { stream: "stdin", text: message.data });
      }
      live.socket.send(JSON.stringify(message));
    };
    const stream = live.lines.iterate();
    const channel: RunnerChannel = {
      spawn: (argv, env, cwd) => {
        if (live.spawned !== null) {
          return Promise.reject(new Error("runner spawn already in progress"));
        }
        const spawned = Promise.withResolvers<void>();
        live.spawned = spawned;
        live.exited = Promise.withResolvers<void>();
        live.stderrTail = "";
        const timer = setTimeout(() => {
          spawned.reject(new Error("runner did not spawn the child in time"));
          this.close(token, "spawn timed out");
        }, SPAWN_TIMEOUT_MS);
        this.#log.debug(
          { sessionId: live.sessionId, argv: redactArgv(argv), cwd, env: Object.keys(env) },
          "spawning the agent process",
        );
        send({ type: "spawn", argv: [...argv], env: { ...env }, ...compact({ cwd }) });
        return spawned.promise.finally(() => {
          clearTimeout(timer);
          live.spawned = null;
        });
      },
      write: (data) => {
        send({ type: "stdin", data });
      },
      closeStdin: () => {
        send({ type: "stdin_close" });
      },
      signal: (signal) => {
        send({ type: "signal", signal });
      },
      lines: () => stream,
    };
    const terminate = async (): Promise<void> => {
      if (!this.#live.has(token)) {
        return;
      }
      send({ type: "stdin_close" });
      const timers = [
        setTimeout(() => {
          send({ type: "signal", signal: "SIGTERM" });
        }, TERMINATE_STEP_MS),
        setTimeout(() => {
          send({ type: "signal", signal: "SIGKILL" });
        }, TERMINATE_STEP_MS * 2),
        setTimeout(() => {
          this.#log.warn({ sessionId: live.sessionId }, "agent process did not exit");
          live.exited.resolve();
        }, TERMINATE_STEP_MS * 3),
      ];
      try {
        await live.exited.promise;
      } finally {
        for (const timer of timers) {
          clearTimeout(timer);
        }
        this.close(token, "terminated by the office");
      }
    };
    pending.settle.resolve({ uid, channel, terminate });
  }
}
