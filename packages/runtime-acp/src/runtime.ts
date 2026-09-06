import {
  type AgentRuntime,
  type Cancellation,
  createChannel,
  type RuntimeEvent,
  type RuntimeSession,
} from "@ho/core";
import { openConnection } from "./connection.ts";
import { newTurn, stopToEvent, updateToEvents } from "./events.ts";
import { describe, isAuthRequired, negotiate } from "./negotiate.ts";
import type { AcpPreset } from "./presets.ts";
import { channelStream } from "./stream.ts";

const CLOSE_GRACE_MS = 5000;
const STDERR_TAIL = 6;
const STDERR_TAIL_CHARS = 600;

export type AcpRuntimeOptions = { onStderr?: (text: string) => void };

/**
 * One ACP agent per office session: spawn the CLI through the runner relay, negotiate, create (or load) a
 * session with the office's MCP servers, then run one prompt per `prompt()` call and translate the
 * notifications into runtime events.
 */
export function createAcpRuntime(preset: AcpPreset, options: AcpRuntimeOptions = {}): AgentRuntime {
  return {
    id: preset.id,
    capabilities: () => ({
      resume: preset.resume,
      structuredOutput: false,
      images: false,
      effortLevels: [],
    }),
    open: async (spec, channel, secrets): Promise<RuntimeSession> => {
      // The CLI's last complaints travel with exit errors so a failed start explains itself in the task.
      const tail: string[] = [];
      const stderr = (text: string): void => {
        options.onStderr?.(text);
        tail.push(text.trim());
        if (tail.length > STDERR_TAIL) {
          tail.shift();
        }
      };
      const lastStderr = (): string =>
        tail.length === 0 ? "" : `: ${tail.join(" | ").slice(-STDERR_TAIL_CHARS)}`;
      await channel.spawn(preset.argv(spec), { ...preset.env(spec), ...secrets }, spec.cwd);
      const { stream, exited } = channelStream(channel, stderr);
      const office = openConnection(stream);
      const { sessionId, resumed, servers } = await negotiate(
        office.conn,
        preset,
        spec,
        exited,
        stderr,
        lastStderr,
      );
      let first = true;

      async function* prompt(
        input: { text: string },
        signal?: Cancellation,
      ): AsyncIterable<RuntimeEvent> {
        const events = createChannel<RuntimeEvent>(signal);
        const turn = newTurn();
        if (first) {
          first = false;
          events.push({
            kind: "init",
            runtimeSessionId: sessionId,
            model: spec.model,
            plugins: [],
            pluginErrors: [],
            tools: 0,
            mcpServers: servers.map((s) => s.name),
          });
        }
        const flush = (): void => {
          for (const event of office.drain()) {
            events.push(event);
          }
        };
        office.listen((update) => {
          flush();
          for (const event of updateToEvents(update, turn)) {
            events.push(event);
          }
        });
        // ACP has no system prompt: the office's instructions open a fresh conversation.
        const appendix = spec.systemPromptAppendix.trim();
        const text =
          resumed || appendix === "" ? input.text : `${appendix}\n\n---\n\n${input.text}`;
        signal?.addEventListener("abort", () => {
          void office.conn.agent.notify("session/cancel", { sessionId }).catch(() => null);
        });
        void Promise.race([
          office.conn.agent.request("session/prompt", {
            sessionId,
            prompt: [{ type: "text", text }],
          }),
          exited.then((code) => {
            throw new Error(
              `${preset.name} exited (code ${String(code)}) during the prompt${lastStderr()}`,
            );
          }),
        ])
          .then(
            (response) => {
              flush();
              events.push(stopToEvent(response.stopReason, turn, sessionId));
            },
            (error: unknown) => {
              events.push({
                kind: "error",
                code: isAuthRequired(error) ? "authentication_failed" : "process_exit",
                message: describe(error),
              });
            },
          )
          .finally(() => {
            office.listen(null);
            events.close();
          });
        yield* events.iterate();
      }

      return {
        prompt,
        interrupt: async () => {
          await office.conn.agent.notify("session/cancel", { sessionId }).catch(() => null);
        },
        close: async () => {
          office.conn.close();
          channel.closeStdin();
          const deadline = setTimeout(() => {
            channel.signal("SIGTERM");
          }, CLOSE_GRACE_MS);
          await exited;
          clearTimeout(deadline);
        },
        resumeToken: () => sessionId,
      };
    },
  };
}
