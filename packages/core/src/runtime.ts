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
  maxUsd: number | null;
  allowWrites: boolean;
  systemPromptAppendix: string;
  cwd: string;
  resume: string | null;
  pluginDirs: readonly string[];
  mcpServers: Readonly<Record<string, McpServerSpec>>;
};

export type RunnerLine =
  | { stream: "stdout" | "stderr"; text: string }
  | { stream: "exit"; code: number | null; stderrTail: string };

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
  close: () => void;
};

export type AgentRuntime = {
  readonly id: ProviderId;
  open: (
    spec: RuntimeSessionSpec,
    channel: RunnerChannel,
    secrets: Readonly<Record<string, string>>,
  ) => Promise<RuntimeSession>;
};
