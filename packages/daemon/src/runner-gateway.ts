import {
  type Cancellation,
  type Clock,
  createChannel,
  type RunnerChannel,
  type RunnerLine,
} from "@ho/core";
import { compact, type SessionId } from "@ho/protocol";
import { FromRunner, RUNNER_PATH, type RunnerHello, type ToRunner } from "@ho/protocol/runner";
import type { Logger } from "./logger.ts";

export type RunnerConnection = { hello: RunnerHello; channel: RunnerChannel; close: () => void };
export type RunnerSocket = { send: (data: string) => unknown; close: () => void };
export type RunnerSocketData = { kind: "runner"; token: string };

type Pending = {
  sessionId: SessionId;
  expiresAt: number;
  resolve: (connection: RunnerConnection) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
  ready: () => void;
};
type Live = {
  push: (line: RunnerLine) => void;
  close: () => void;
  spawned: PromiseWithResolvers<void> | null;
  onHello: ((hello: RunnerHello) => void) | null;
};

const CONNECT_TIMEOUT_MS = 30_000;
const SPAWN_TIMEOUT_MS = 15_000;

export class RunnerGateway {
  readonly #pending = new Map<string, Pending>();
  readonly #live = new Map<string, Live>();
  readonly #clock: Clock;
  readonly #log: Logger;

  constructor(clock: Clock, log: Logger) {
    this.#clock = clock;
    this.#log = log;
  }

  issue(
    sessionId: SessionId,
    signal?: Cancellation,
  ): {
    token: string;
    connected: Promise<RunnerConnection>;
    cancel: () => void;
  } {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
    const connected = Promise.withResolvers<RunnerConnection>();
    const cancel = (): void => {
      const pending = this.#pending.get(token);
      this.#pending.delete(token);
      pending?.cleanup();
      connected.reject(new Error("runner connection cancelled or timed out"));
      this.close(token);
    };
    const timer = setTimeout(cancel, CONNECT_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    this.#pending.set(token, {
      sessionId,
      expiresAt: this.#clock.now().getTime() + CONNECT_TIMEOUT_MS,
      resolve: connected.resolve,
      reject: connected.reject,
      cleanup,
      ready: () => {
        clearTimeout(timer);
      },
    });
    signal?.addEventListener("abort", cancel);
    if (signal?.aborted === true) {
      cancel();
    }
    void connected.promise.catch(() => undefined);
    return { token, connected: connected.promise, cancel };
  }

  authorize(req: Request): string | null {
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") === true ? header.slice(7) : null;
    const pending = token === null ? undefined : this.#pending.get(token);
    return token !== null &&
      pending !== undefined &&
      pending.expiresAt > this.#clock.now().getTime()
      ? token
      : null;
  }

  open(token: string, socket: RunnerSocket): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) {
      socket.close();
      return;
    }
    this.#pending.delete(token);
    const send = (message: ToRunner): void => {
      socket.send(JSON.stringify(message));
    };
    const lines = createChannel<RunnerLine>(undefined, {
      capacity: 128,
      onClose: () => {
        this.close(token);
      },
    });
    const stream = lines.iterate();
    const state: Live = {
      push: lines.push,
      spawned: null,
      close: () => {
        pending.cleanup();
        pending.reject(new Error("runner disconnected before hello"));
        state.spawned?.reject(new Error("runner disconnected before spawning"));
        lines.push({ stream: "exit", code: null });
        lines.close();
        socket.close();
      },
      onHello: (hello) => {
        state.onHello = null;
        pending.ready();
        const channel: RunnerChannel = {
          spawn: (argv, env, cwd) => {
            if (state.spawned !== null) {
              return Promise.reject(new Error("runner spawn already in progress"));
            }
            const spawned = Promise.withResolvers<void>();
            state.spawned = spawned;
            const timer = setTimeout(() => {
              spawned.reject(new Error("runner did not spawn the child in time"));
              this.close(token);
            }, SPAWN_TIMEOUT_MS);
            send({
              type: "spawn",
              argv: [...argv],
              env: { ...env },
              ...compact({ cwd }),
            });
            return spawned.promise.finally(() => {
              clearTimeout(timer);
              state.spawned = null;
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
        pending.resolve({
          hello,
          channel,
          close: () => {
            this.close(token);
          },
        });
      },
    };
    this.#live.set(token, state);
    this.#log.debug({ sessionId: pending.sessionId }, "runner connected");
  }

  message(token: string, _socket: RunnerSocket, raw: string | Buffer | Uint8Array): void {
    const live = this.#live.get(token);
    if (live === undefined) {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      this.close(token);
      return;
    }
    const parsed = FromRunner.safeParse(json);
    if (!parsed.success || (live.onHello !== null && parsed.data.type !== "hello")) {
      this.#log.warn("invalid runner message");
      this.close(token);
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case "hello": {
        if (live.onHello === null) {
          this.close(token);
        } else {
          live.onHello(message);
        }
        break;
      }
      case "spawned": {
        live.spawned?.resolve();
        break;
      }
      case "stdout": {
        live.push({ stream: "stdout", text: message.line });
        break;
      }
      case "stderr": {
        live.push({ stream: "stderr", text: message.text });
        break;
      }
      case "exit": {
        live.spawned?.reject(new Error("runner child exited before spawning"));
        live.push({ stream: "exit", code: message.code });
        break;
      }
      case "error": {
        live.spawned?.reject(new Error(message.message));
        live.push({ stream: "stderr", text: `runner: ${message.message}` });
        break;
      }
    }
  }

  close(token: string): void {
    const live = this.#live.get(token);
    this.#live.delete(token);
    live?.close();
  }

  static readonly path = RUNNER_PATH;
}
