import {
  type Cancellation,
  type Clock,
  createChannel,
  type RunnerChannel,
  type RunnerLine,
} from "@ho/core";
import {
  FromRunner,
  RUNNER_PATH,
  type RunnerHello,
  type SessionId,
  type ToRunner,
} from "@ho/protocol";
import type { Logger } from "./logger.ts";

export type RunnerConnection = { hello: RunnerHello; channel: RunnerChannel; close: () => void };

type Pending = {
  sessionId: SessionId;
  expiresAt: number;
  resolve: (c: RunnerConnection) => void;
  reject: (e: Error) => void;
};

export type RunnerSocket = { send: (data: string) => unknown; close: () => void };
export type RunnerSocketData = { kind: "runner"; token: string };

const TOKEN_TTL_MS = 60_000;
const SPAWN_TIMEOUT_MS = 15_000;

/**
 * Accepts inbound connections from `ho-runner` processes. Each sandbox gets a one-time token; the
 * connection becomes a `RunnerChannel` for exactly one runtime session.
 */
export class RunnerGateway {
  readonly #pending = new Map<string, Pending>();
  readonly #live = new Map<
    string,
    {
      push: (line: RunnerLine) => void;
      spawned: PromiseWithResolvers<void> | null;
      onHello: (hello: RunnerHello, socket: RunnerSocket) => void;
    }
  >();
  readonly #clock: Clock;
  readonly #log: Logger;

  constructor(clock: Clock, log: Logger) {
    this.#clock = clock;
    this.#log = log;
  }

  /** Issues a one-time token and a promise that resolves when the runner says hello. */
  issue(
    sessionId: SessionId,
    signal?: Cancellation,
  ): { token: string; connected: Promise<RunnerConnection> } {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
    const connected = new Promise<RunnerConnection>((resolve, reject) => {
      this.#pending.set(token, {
        sessionId,
        expiresAt: this.#clock.now().getTime() + TOKEN_TTL_MS,
        resolve,
        reject,
      });
      signal?.addEventListener("abort", () => {
        if (this.#pending.delete(token)) {
          reject(new Error("runner connection cancelled"));
        }
      });
    });
    return { token, connected };
  }

  /** Returns true when the request carries a valid pending token (call before upgrading). */
  authorize(req: Request): string | null {
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : null;
    const pending = token === null ? undefined : this.#pending.get(token);
    if (token === null || pending === undefined) {
      return null;
    }
    if (pending.expiresAt < this.#clock.now().getTime()) {
      this.#pending.delete(token);
      pending.reject(new Error("runner token expired"));
      return null;
    }
    return token;
  }

  open(token: string, socket: RunnerSocket): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) {
      socket.close();
      return;
    }
    this.#pending.delete(token);
    const lines = createChannel<RunnerLine>();
    const state = {
      push: lines.push,
      spawned: null as PromiseWithResolvers<void> | null,
      onHello: (hello: RunnerHello, ws: RunnerSocket) => {
        const send = (message: ToRunner): void => {
          ws.send(JSON.stringify(message));
        };
        const channel: RunnerChannel = {
          spawn: (argv, env, cwd) => {
            const spawned = Promise.withResolvers<void>();
            state.spawned = spawned;
            send({
              type: "spawn",
              argv: [...argv],
              env: { ...env },
              ...(cwd === undefined ? {} : { cwd }),
            });
            const timer = setTimeout(() => {
              spawned.reject(new Error("runner did not spawn the child in time"));
            }, SPAWN_TIMEOUT_MS);
            return spawned.promise.finally(() => {
              clearTimeout(timer);
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
          lines: () => lines.iterate(),
        };
        pending.resolve({
          hello,
          channel,
          close: () => {
            send({ type: "shutdown" });
            lines.close();
          },
        });
      },
    };
    this.#live.set(token, state);
    this.#log.debug({ sessionId: pending.sessionId }, "runner connected");
  }

  message(token: string, socket: RunnerSocket, raw: string | Buffer | Uint8Array): void {
    const live = this.#live.get(token);
    if (live === undefined) {
      return;
    }
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = FromRunner.safeParse(JSON.parse(text));
    if (!parsed.success) {
      this.#log.warn({ issue: parsed.error.message }, "unparseable runner message");
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case "hello": {
        live.onHello(message, socket);
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
    if (live !== undefined) {
      live.push({ stream: "exit", code: null });
      this.#live.delete(token);
    }
  }

  static readonly path = RUNNER_PATH;
}
