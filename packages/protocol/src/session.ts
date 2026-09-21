import { z } from "zod";
import { EffortLevel, IsoDateTime, SessionState } from "./domain.ts";
import { AgentId, ChatThreadId, SessionId, TaskId } from "./ids.ts";
import { SessionMode, SessionServices } from "./roles.ts";
import { Usage } from "./usage.ts";

export const SessionRuntime = z.object({
  model: z.string().min(1),
  effort: EffortLevel,
  promptHash: z.string().min(1),
  skillPacks: z.array(z.string().min(1)),
  image: z.string().min(1),
  confirmedModel: z.string().min(1).optional(),
  confirmedEffort: z.string().min(1).optional(),
});
export type SessionRuntime = z.infer<typeof SessionRuntime>;

export const Session = z.object({
  id: SessionId,
  taskId: TaskId,
  agentId: AgentId,
  mode: SessionMode.default("work"),
  state: SessionState,
  runtimeSessionId: z.string().optional(),
  sandboxId: z.string().optional(),
  services: SessionServices.optional(),
  runtime: SessionRuntime.optional(),
  threadId: ChatThreadId.optional(),
  resumedFrom: SessionId.optional(),
  round: z.int().nonnegative().default(0),
  usage: Usage,
  costUsd: z.number().nonnegative().optional(),
  costBasis: z.string().max(40).optional(),
  planPercent: z.number().nonnegative().optional(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
});
export type Session = z.infer<typeof Session>;
