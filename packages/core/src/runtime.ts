import type { AgentId, EffortLevel, RuntimeEvent, SessionId, TaskId } from "@ho/protocol";
import type { Cancellation } from "./ports.ts";

export type { RuntimeErrorCode, RuntimeEvent } from "@ho/protocol";

export type RuntimeCapabilities = {
  resume: boolean;
  structuredOutput: boolean;
  images: boolean;
  effortLevels: readonly EffortLevel[];
};

export type PromptInput = { text: string };

export type RuntimeSessionSpec = {
  sessionId: SessionId;
  taskId: TaskId;
  agentId: AgentId;
  model: string;
  effort: EffortLevel;
  maxTurns: number;
  systemPromptAppendix: string;
  cwd: string;
  /** Provider-specific session id to resume, when the runtime supports it. */
  resume: string | null;
  /** Plugin directories inside the sandbox (role skill packs). */
  pluginDirs: readonly string[];
};

export type RunnerLine =
  | { stream: "stdout" | "stderr"; text: string }
  | { stream: "exit"; code: number | null };

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
  prompt: (input: PromptInput, signal?: Cancellation) => AsyncIterable<RuntimeEvent>;
  interrupt: () => Promise<void>;
  close: () => Promise<void>;
  readonly resumeToken: () => string | null;
};

export type AgentRuntime = {
  readonly id: "claude-code" | (string & {});
  capabilities: () => RuntimeCapabilities;
  /** `secrets` is the environment the child must receive at spawn time (never persisted, never logged). */
  open: (
    spec: RuntimeSessionSpec,
    channel: RunnerChannel,
    secrets: Readonly<Record<string, string>>,
  ) => Promise<RuntimeSession>;
};
