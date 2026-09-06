import type { RuntimeSessionSpec } from "@ho/core";

/**
 * Static, token-lean Claude Code settings applied inside every sandbox (inline JSON, no files).
 * The RTK PreToolUse hook is not here: `rtk init --hook-only` writes it into the image's user settings,
 * which Claude Code reads through `--setting-sources user` and RTK checks before rewriting.
 */
export const CLAUDE_SETTINGS = {
  includeCoAuthoredBy: false,
  autoUpdatesChannel: "stable",
  env: {
    DISABLE_AUTOUPDATER: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    USE_BUILTIN_RIPGREP: "0",
  },
} as const;

type McpConfigEntry =
  | { type: "http"; url: string; headers: Record<string, string> }
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> };

export type ClaudeCommandOptions = {
  /** Extra MCP servers to expose besides the session's own. */
  mcpServers?: Readonly<Record<string, McpConfigEntry>>;
  pluginDirs?: readonly string[];
};

const mcpEntry = (spec: RuntimeSessionSpec["mcpServers"][string]): McpConfigEntry =>
  spec.kind === "http"
    ? { type: "http", url: spec.url, headers: { ...spec.headers } }
    : { type: "stdio", command: spec.command, args: [...spec.args], env: { ...spec.env } };

/** Builds the `claude` argv for a session. Prompts travel over stdin as stream-json user messages. */
export function claudeArgv(
  spec: RuntimeSessionSpec,
  claudeSessionId: string,
  options: ClaudeCommandOptions = {},
): string[] {
  const argv = [
    "claude",
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    spec.model,
    "--effort",
    spec.effort,
    "--max-turns",
    String(spec.maxTurns),
    "--permission-mode",
    "bypassPermissions",
    "--setting-sources",
    "user",
    "--settings",
    JSON.stringify(CLAUDE_SETTINGS),
    "--strict-mcp-config",
    "--name",
    `ho/${spec.agentId.slice(0, 8)}/${spec.taskId.slice(0, 8)}`,
  ];
  if (spec.resume === null) {
    argv.push("--session-id", claudeSessionId);
  } else {
    argv.push("--resume", spec.resume);
  }
  if (spec.auth === "api-key" && spec.maxUsd !== null) {
    argv.push("--max-budget-usd", String(spec.maxUsd));
  }
  if (spec.systemPromptAppendix.trim() !== "") {
    argv.push("--append-system-prompt", spec.systemPromptAppendix);
  }
  const mcpServers: Record<string, McpConfigEntry> = {
    ...Object.fromEntries(Object.entries(spec.mcpServers).map(([name, s]) => [name, mcpEntry(s)])),
    ...options.mcpServers,
  };
  if (Object.keys(mcpServers).length > 0) {
    argv.push("--mcp-config", JSON.stringify({ mcpServers }));
  }
  for (const dir of [...spec.pluginDirs, ...(options.pluginDirs ?? [])]) {
    argv.push("--plugin-dir", dir);
  }
  return argv;
}

/** A user turn in stream-json input mode. */
export const userMessage = (text: string): string =>
  `${JSON.stringify({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })}\n`;
