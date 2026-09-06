import type { RuntimeSessionSpec } from "@ho/core";

/** Static, token-lean Claude Code settings applied inside every sandbox (inline JSON, no files). */
export const CLAUDE_SETTINGS = {
  includeCoAuthoredBy: false,
  autoUpdatesChannel: "stable",
  // RTK rewrites Bash commands to compact equivalents before they run (60–90 % smaller tool output).
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
  },
  env: {
    DISABLE_AUTOUPDATER: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    USE_BUILTIN_RIPGREP: "0",
  },
} as const;

export type ClaudeCommandOptions = {
  /** Streamable HTTP MCP servers to expose (the HO server arrives in Phase 3). */
  mcpServers?: Readonly<
    Record<string, { type: "http"; url: string; headers?: Readonly<Record<string, string>> }>
  >;
  pluginDirs?: readonly string[];
};

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
  if (spec.systemPromptAppendix.trim() !== "") {
    argv.push("--append-system-prompt", spec.systemPromptAppendix);
  }
  if (options.mcpServers !== undefined && Object.keys(options.mcpServers).length > 0) {
    argv.push("--mcp-config", JSON.stringify({ mcpServers: options.mcpServers }));
  }
  for (const dir of [...spec.pluginDirs, ...(options.pluginDirs ?? [])]) {
    argv.push("--plugin-dir", dir);
  }
  return argv;
}

/** A user turn in stream-json input mode. */
export const userMessage = (text: string): string =>
  `${JSON.stringify({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })}\n`;
