import type { AgentRuntime, Clock } from "@ho/core";
import type { ProviderId } from "@ho/protocol";
import { codexPreset, createAcpRuntime, geminiPreset, opencodePreset } from "@ho/runtime-acp";
import { createClaudeCodeRuntime } from "@ho/runtime-claude-code";
import type { Logger } from "./logger.ts";
import { VERSION } from "./version.ts";

const LINE_LOG_CHARS = 500;
const SHAPE = /"type":"(?<type>\w+)"(?:,"subtype":"(?<subtype>\w+)")?/u;

const shapeOf = (text: string): string => {
  const found = SHAPE.exec(text)?.groups;
  if (found === undefined) {
    return "unparsed";
  }
  const { type, subtype } = found;
  return `${type ?? "?"}${subtype === undefined ? "" : `/${subtype}`}`;
};

export function createRuntimes(
  log: Logger,
  clock: Clock,
): Readonly<Record<ProviderId, AgentRuntime>> {
  const onStderr = (provider: ProviderId) => (text: string) => {
    log.debug({ provider, stderr: text.slice(0, LINE_LOG_CHARS) }, "agent stderr");
  };
  const seen = new Set<string>();
  const onIgnored = (provider: ProviderId) => (text: string) => {
    const shape = shapeOf(text);
    const fields = { provider, shape, line: text.slice(0, LINE_LOG_CHARS) };
    if (seen.has(shape)) {
      log.debug(fields, "runtime line not understood");
      return;
    }
    seen.add(shape);
    log.warn(fields, "runtime line not understood; later lines of this shape are logged at debug");
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
