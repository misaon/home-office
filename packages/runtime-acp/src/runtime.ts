import type { AgentRuntime, RuntimeSession } from "@ho/core";
import { openConnection } from "./connection.ts";
import { negotiate } from "./negotiate.ts";
import type { AcpPreset } from "./presets.ts";
import { createPrompt } from "./prompt.ts";
import { channelStream } from "./stream.ts";

export type AcpRuntimeOptions = { clientVersion: string; onStderr: (text: string) => void };

/**
 * One ACP agent per office session: spawn the CLI through the runner relay, negotiate, create (or load) a
 * session with the office's MCP servers, then run one prompt per `prompt()` call and translate the
 * notifications into runtime events.
 */
export function createAcpRuntime(preset: AcpPreset, options: AcpRuntimeOptions): AgentRuntime {
  return {
    id: preset.id,
    open: async (spec, channel, secrets): Promise<RuntimeSession> => {
      await channel.spawn(preset.argv(spec), { ...preset.env(spec), ...secrets }, spec.cwd);
      const { stream, exited } = channelStream(channel, options.onStderr);
      const office = openConnection(stream);
      let negotiated;
      try {
        negotiated = await negotiate(
          office.conn,
          preset,
          spec,
          exited,
          options.onStderr,
          options.clientVersion,
        );
      } catch (error) {
        office.conn.close();
        channel.signal("SIGKILL");
        throw error;
      }
      return {
        prompt: createPrompt(office, spec, preset, negotiated, exited),
        close: () => {
          office.conn.close();
        },
      };
    },
  };
}
