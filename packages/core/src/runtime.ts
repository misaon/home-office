import type { AgentId, EffortLevel, SessionId, TaskId, Usage } from "@ho/protocol";
import type { Cancellation } from "./ports.ts";

/** Which brain drives a session. Normalised so the office, UI and scheduler never see provider details. */

export type RuntimeEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; id: string; ok: boolean; summary: string }
  | { kind: "permission_request"; id: string; tool: string; input: unknown }
  | { kind: "usage"; usage: Usage }
  | { kind: "rate_limited"; retryAt: string | null }
  | {
      kind: "result";
      ok: boolean;
      text: string;
      structured?: unknown;
      turns: number;
      runtimeSessionId: string | null;
    }
  | { kind: "error"; code: RuntimeErrorCode; message: string };

export type RuntimeErrorCode =
  | "authentication_failed"
  | "billing_error"
  | "rate_limit"
  | "model_not_found"
  | "invalid_request"
  | "server_error"
  | "max_turns"
  | "process_exit"
  | "protocol"
  | "unknown";

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
};

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
  lines: () => AsyncIterable<
    { stream: "stdout" | "stderr"; text: string } | { stream: "exit"; code: number | null }
  >;
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
  /** Environment the sandbox must receive at spawn time (never persisted, never logged). */
  open: (
    spec: RuntimeSessionSpec,
    channel: RunnerChannel,
    secrets: Readonly<Record<string, string>>,
  ) => Promise<RuntimeSession>;
};
