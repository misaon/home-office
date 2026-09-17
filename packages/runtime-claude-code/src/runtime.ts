import type { AgentRuntime, Cancellation, Clock, RunnerChannel, RuntimeSession } from "@ho/core";
import type { RuntimeEvent } from "@ho/protocol";
import { claudeArgv, userMessage } from "./command.ts";
import { normalizeLine } from "./stream-json.ts";

export type ClaudeRuntimeOptions = { clock: Clock; onStderr: (text: string) => void };

export function createClaudeCodeRuntime(options: ClaudeRuntimeOptions): AgentRuntime {
  return {
    id: "claude-code",
    open: async (spec, channel: RunnerChannel, secrets): Promise<RuntimeSession> => {
      await channel.spawn(claudeArgv(spec, spec.resume ?? crypto.randomUUID()), secrets, spec.cwd);
      const lines = channel.lines()[Symbol.asyncIterator]();

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
            const step = await Promise.race([lines.next(), cancelled.promise]);
            if (step === null) {
              return;
            }
            if (step.done === true) {
              yield {
                kind: "error",
                code: "process_exit",
                message: "claude exited before producing a result",
              };
              return;
            }
            const line = step.value;
            if (line.stream === "exit") {
              yield {
                kind: "error",
                code: "process_exit",
                message: `claude exited with code ${String(line.code)}${line.stderrTail}`,
              };
              return;
            }
            if (line.stream === "stderr") {
              options.onStderr(line.text);
              continue;
            }
            for (const event of normalizeLine(line.text, options.clock.now)) {
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
        close: () => {
          channel.signal("SIGTERM");
        },
      };
    },
  };
}
