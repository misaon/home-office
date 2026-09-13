import type {
  AgentId,
  AuthKind,
  EffortLevel,
  ProviderId,
  RuntimeEvent,
  SessionId,
  TaskId,
} from "@ho/protocol";
import type { Cancellation } from "./ports.ts";

export type McpServerSpec =
  | { kind: "http"; url: string; headers: Readonly<Record<string, string>> }
  | {
      kind: "stdio";
      command: string;
      args: readonly string[];
      env: Readonly<Record<string, string>>;
    };

export type RuntimeSessionSpec = {
  sessionId: SessionId;
  taskId: TaskId;
  agentId: AgentId;
  provider: ProviderId;
  auth: AuthKind;
  model: string;
  effort: EffortLevel;
  maxTurns: number;
  /** Spending cap for API-key sessions where the CLI supports one (Claude Code `--max-budget-usd`). */
  maxUsd: number | null;
  systemPromptAppendix: string;
  cwd: string;
  /** Provider-specific session id to resume, when the runtime supports it. */
  resume: string | null;
  /** Plugin directories inside the sandbox (role skill packs); Claude Code reads them, ACP agents cannot. */
  pluginDirs: readonly string[];
  /** MCP servers this session may call: the HO tool server (HTTP, per-session token) and sandbox-local stdio servers. */
  mcpServers: Readonly<Record<string, McpServerSpec>>;
};

export type RunnerLine =
  | { stream: "stdout" | "stderr"; text: string }
  /** The child is gone; `stderrTail` is the last of what it wrote to stderr, for the failure text. */
  | { stream: "exit"; code: number | null; stderrTail: string };

/** The daemon's side of a runner connection: a line-oriented child process relay. */
export type RunnerChannel = {
  spawn: (
    argv: readonly string[],
    env: Readonly<Record<string, string>>,
    cwd?: string,
  ) => Promise<void>;
  write: (data: string) => void;
  closeStdin: () => void;
  signal: (signal: "SIGINT" | "SIGTERM" | "SIGKILL") => void;
  lines: () => AsyncIterable<RunnerLine>;
};

export type RuntimeSession = {
  prompt: (input: { text: string }, signal?: Cancellation) => AsyncIterable<RuntimeEvent>;
  /** Lets go of the agent's protocol state; the daemon terminates the child itself. */
  close: () => void;
};

export type AgentRuntime = {
  readonly id: ProviderId;
  /** `secrets` is the environment the child must receive at spawn time (never persisted, never logged). */
  open: (
    spec: RuntimeSessionSpec,
    channel: RunnerChannel,
    secrets: Readonly<Record<string, string>>,
  ) => Promise<RuntimeSession>;
};
