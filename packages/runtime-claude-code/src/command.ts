import type { RuntimeSessionSpec } from "@ho/core";

const CLAUDE_SETTINGS = {
  attribution: { commit: "", pr: "", sessionUrl: false },
  includeGitInstructions: false,
  bashOutputMaxChars: 10_000,
} as const;

type McpConfigEntry =
  | { type: "http"; url: string; headers: Record<string, string> }
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> };

const mcpEntry = (spec: RuntimeSessionSpec["mcpServers"][string]): McpConfigEntry =>
  spec.kind === "http"
    ? { type: "http", url: spec.url, headers: { ...spec.headers } }
    : { type: "stdio", command: spec.command, args: [...spec.args], env: { ...spec.env } };

export function claudeArgv(spec: RuntimeSessionSpec, claudeSessionId: string): string[] {
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
    "user,project",
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
  const mcpServers = Object.fromEntries(
    Object.entries(spec.mcpServers).map(([name, s]) => [name, mcpEntry(s)]),
  );
  if (Object.keys(mcpServers).length > 0) {
    argv.push("--mcp-config", JSON.stringify({ mcpServers }));
  }
  for (const dir of spec.pluginDirs) {
    argv.push("--plugin-dir", dir);
  }
  return argv;
}

export const userMessage = (text: string): string =>
  `${JSON.stringify({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })}\n`;
