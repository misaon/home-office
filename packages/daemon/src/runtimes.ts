import type { AgentRuntime, Clock } from "@ho/core";
import type { ProviderId } from "@ho/protocol";
import { codexPreset, createAcpRuntime, geminiPreset, opencodePreset } from "@ho/runtime-acp";
import { createClaudeCodeRuntime } from "@ho/runtime-claude-code";
import type { Logger } from "./logger.ts";
import { VERSION } from "./version.ts";

const LINE_LOG_CHARS = 500;

export function createRuntimes(
  log: Logger,
  clock: Clock,
): Readonly<Record<ProviderId, AgentRuntime>> {
  const onStderr = (provider: ProviderId) => (text: string) => {
    log.debug({ provider, stderr: text.slice(0, LINE_LOG_CHARS) }, "agent stderr");
  };
  const onIgnored = (provider: ProviderId) => (text: string) => {
    log.debug({ provider, line: text.slice(0, LINE_LOG_CHARS) }, "runtime line not understood");
  };
  return {
    "claude-code": createClaudeCodeRuntime({
      clock,
      onStderr: onStderr("claude-code"),
      onIgnored: onIgnored("claude-code"),
    }),
    opencode: createAcpRuntime(opencodePreset(), {
      clientVersion: VERSION,
      onStderr: onStderr("opencode"),
    }),
    "gemini-cli": createAcpRuntime(geminiPreset(), {
      clientVersion: VERSION,
      onStderr: onStderr("gemini-cli"),
    }),
    codex: createAcpRuntime(codexPreset(), { clientVersion: VERSION, onStderr: onStderr("codex") }),
  };
}
