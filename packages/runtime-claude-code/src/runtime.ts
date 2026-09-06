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
      images: true,
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
      const token = secrets[OAUTH_TOKEN_ENV];
      if (token === undefined) {
        throw new Error(`${OAUTH_TOKEN_ENV} is not available for this session`);
      }
      await channel.spawn(
        claudeArgv(spec, claudeSessionId, options),
        { [OAUTH_TOKEN_ENV]: token },
        spec.cwd,
      );

      async function* prompt(
        input: { text: string },
        signal?: Cancellation,
      ): AsyncIterable<RuntimeEvent> {
        channel.write(userMessage(input.text));
        for (;;) {
          if (signal?.aborted === true) {
            channel.signal("SIGINT");
          }
          const line = await reader.next();
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
      }

      return {
        prompt,
        interrupt: () => {
          channel.signal("SIGINT");
          return Promise.resolve();
        },
        close: async () => {
          channel.closeStdin();
          const deadline = setTimeout(() => {
            channel.signal("SIGTERM");
          }, 5000);
          while (!reader.exited && (await reader.next()) !== null) {
            // drain until exit
          }
          clearTimeout(deadline);
        },
        resumeToken: () => resumeToken,
      };
    },
  };
}
