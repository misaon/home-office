import type { AgentRuntime } from "@ho/core";
import type { ProviderId } from "@ho/protocol";
import { codexPreset, createAcpRuntime, geminiPreset, opencodePreset } from "@ho/runtime-acp";
import { createClaudeCodeRuntime } from "@ho/runtime-claude-code";
import type { Logger } from "./logger.ts";

/** One runtime per provider in the catalog: Claude Code speaks stream-json, the rest ACP. */
export function createRuntimes(
  log: Logger,
  clock: { now: () => Date },
): Readonly<Record<ProviderId, AgentRuntime>> {
  const onStderr = (provider: ProviderId) => (text: string) => {
    log.debug({ provider, stderr: text.slice(0, 500) }, "agent stderr");
  };
  return {
    "claude-code": createClaudeCodeRuntime({ clock, onStderr: onStderr("claude-code") }),
    opencode: createAcpRuntime(opencodePreset(), { onStderr: onStderr("opencode") }),
    "gemini-cli": createAcpRuntime(geminiPreset(), { onStderr: onStderr("gemini-cli") }),
    codex: createAcpRuntime(codexPreset(), { onStderr: onStderr("codex") }),
  };
}
