import type {
  AgentRuntime,
  Cancellation,
  Clock,
  RunnerChannel,
  RuntimeEvent,
  RuntimeSession,
  RuntimeSessionSpec,
} from "@ho/core";
import { type ClaudeCommandOptions, claudeArgv, userMessage } from "./command.ts";
import { normalizeLine } from "./stream-json.ts";

export const OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";
export const API_KEY_ENV = "ANTHROPIC_API_KEY";

type Line = { stream: "stdout" | "stderr"; text: string } | { stream: "exit"; code: number | null };

export type ClaudeRuntimeOptions = ClaudeCommandOptions & {
  clock?: Clock;
  onStderr?: (text: string) => void;
};

/** Shares one runner line stream across sequential prompts; each prompt drains until its `result`. */
class Reader {
  readonly #iterator: AsyncIterator<Line>;
  #exit: number | null | undefined;

  constructor(lines: AsyncIterable<Line>) {
    this.#iterator = lines[Symbol.asyncIterator]();
  }

  get exited(): boolean {
    return this.#exit !== undefined;
  }

  async next(): Promise<Line | null> {
    if (this.exited) {
      return null;
    }
    const step = await this.#iterator.next();
    if (step.done === true) {
      this.#exit = null;
      return null;
    }
    if (step.value.stream === "exit") {
      this.#exit = step.value.code;
    }
    return step.value;
  }
}

export function createClaudeCodeRuntime(options: ClaudeRuntimeOptions = {}): AgentRuntime {
  const clock = options.clock ?? { now: () => new Date() };
  return {
    id: "claude-code",
    capabilities: () => ({
      resume: true,
      structuredOutput: true,
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    }),
    open: async (
      spec: RuntimeSessionSpec,
      channel: RunnerChannel,
      secrets,
    ): Promise<RuntimeSession> => {
      const claudeSessionId = spec.resume ?? crypto.randomUUID();
      let resumeToken: string | null = spec.resume;
      const reader = new Reader(channel.lines());
      // Subscription sessions carry the OAuth token, API-key sessions the key; never both.
      const credential = spec.auth === "api-key" ? API_KEY_ENV : OAUTH_TOKEN_ENV;
      const value = secrets[credential];
      if (value === undefined) {
        throw new Error(`${credential} is not available for this session`);
      }
      await channel.spawn(
        claudeArgv(spec, claudeSessionId, options),
        { [credential]: value },
        spec.cwd,
      );

      async function* prompt(
        input: { text: string },
        signal?: Cancellation,
      ): AsyncIterable<RuntimeEvent> {
        const cancelled = Promise.withResolvers<null>();
        const cancel = (): void => {
          channel.signal("SIGINT");
          cancelled.resolve(null);
        };
        signal?.addEventListener("abort", cancel);
        try {
          if (signal?.aborted === true) {
            return;
          }
          channel.write(userMessage(input.text));
          for (;;) {
            const line = await Promise.race([reader.next(), cancelled.promise]);
            if (line === null) {
              yield {
                kind: "error",
                code: "process_exit",
                message: "claude exited before producing a result",
              };
              return;
            }
            if (line.stream === "exit") {
              yield {
                kind: "error",
                code: "process_exit",
                message: `claude exited with code ${String(line.code)}`,
              };
              return;
            }
            if (line.stream === "stderr") {
              options.onStderr?.(line.text);
              continue;
            }
            for (const event of normalizeLine(line.text, clock.now)) {
              if (event.kind === "result") {
                resumeToken = event.runtimeSessionId;
              }
              yield event;
              if (event.kind === "result") {
                return;
              }
            }
          }
        } finally {
          signal?.removeEventListener("abort", cancel);
        }
      }

      return {
        prompt,
        interrupt: () => {
          channel.signal("SIGINT");
          return Promise.resolve();
        },
        close: async () => {
          channel.closeStdin();
          const terminate = setTimeout(() => {
            channel.signal("SIGTERM");
          }, 5000);
          const kill = setTimeout(() => {
            channel.signal("SIGKILL");
          }, 10_000);
          let deadline: ReturnType<typeof setTimeout> | undefined;
          const drain = async (): Promise<void> => {
            while (!reader.exited && (await reader.next()) !== null) {
              continue;
            }
          };
          try {
            await Promise.race([
              drain(),
              new Promise<never>((_resolve, reject) => {
                deadline = setTimeout(() => {
                  reject(new Error("Claude did not exit"));
                }, 15_000);
              }),
            ]);
          } finally {
            clearTimeout(terminate);
            clearTimeout(kill);
            clearTimeout(deadline);
          }
        },
        resumeToken: () => resumeToken,
      };
    },
  };
}
