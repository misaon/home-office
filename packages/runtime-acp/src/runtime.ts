import type { AgentRuntime, RuntimeSession } from "@ho/core";
import { PROVIDERS } from "@ho/protocol";
import { openConnection } from "./connection.ts";
import { negotiate } from "./negotiate.ts";
import type { AcpPreset } from "./presets.ts";
import { channelStream } from "./stream.ts";
import { createPrompt } from "./prompt.ts";

const CLOSE_GRACE_MS = 5000;
const STDERR_TAIL = 6;
const STDERR_TAIL_CHARS = 600;

export type AcpRuntimeOptions = { clientVersion: string; onStderr?: (text: string) => void };

/**
 * One ACP agent per office session: spawn the CLI through the runner relay, negotiate, create (or load) a
 * session with the office's MCP servers, then run one prompt per `prompt()` call and translate the
 * notifications into runtime events.
 */
export function createAcpRuntime(preset: AcpPreset, options: AcpRuntimeOptions): AgentRuntime {
  return {
    id: preset.id,
    capabilities: () => ({
      resume: preset.resume,
      structuredOutput: false,
      effortLevels: PROVIDERS[preset.id].effortLevels,
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
      const negotiated = await negotiate(office.conn, preset, spec, {
        exited,
        stderr,
        lastStderr,
        clientVersion: options.clientVersion,
      });

      const { sessionId } = negotiated;
      return {
        prompt: createPrompt(office, spec, preset, negotiated, exited, lastStderr),
        interrupt: async () => {
          await office.conn.agent.notify("session/cancel", { sessionId }).catch(() => null);
        },
        close: async () => {
          channel.closeStdin();
          const terminate = setTimeout(() => {
            channel.signal("SIGTERM");
          }, CLOSE_GRACE_MS);
          const kill = setTimeout(() => {
            channel.signal("SIGKILL");
          }, CLOSE_GRACE_MS * 2);
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              exited,
              new Promise<never>((_resolve, reject) => {
                deadline = setTimeout(() => {
                  reject(new Error(`${preset.name} did not exit`));
                }, CLOSE_GRACE_MS * 3);
              }),
            ]);
          } finally {
            clearTimeout(terminate);
            clearTimeout(kill);
            clearTimeout(deadline);
            office.conn.close();
          }
        },
        resumeToken: () => sessionId,
      };
    },
  };
}
