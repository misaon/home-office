import { z } from "zod";
import { EffortLevel, IsoDateTime } from "./domain.ts";
import { AgentId, ProjectId, TaskId } from "./ids.ts";
import { AgentRole } from "./roles.ts";
import { Usage } from "./usage.ts";

export const ReviewVerdict = z.enum(["approve", "request_changes"]);
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

const SEPARATOR = ": ";

export const formatReviewNote = (verdict: ReviewVerdict, findings: string): string =>
  `${verdict}${SEPARATOR}${findings}`;

export const reviewVerdictOf = (text: string): ReviewVerdict | null => {
  const head = text.slice(0, text.indexOf(SEPARATOR));
  const parsed = ReviewVerdict.safeParse(head);
  return parsed.success ? parsed.data : null;
};

const Counts = z.object({
  finished: z.int().nonnegative(),
  blocked: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  firstPass: z.int().nonnegative(),
  reviewRounds: z.int().nonnegative(),
  sessions: z.int().nonnegative(),
  minutes: z.number().nonnegative(),
  ratedGood: z.int().nonnegative(),
  ratedBad: z.int().nonnegative(),
  usage: Usage,
  costUsd: z.number().nonnegative(),
  costKnown: z.int().nonnegative(),
});

export const AgentScore = Counts.extend({
  agentId: AgentId,
  name: z.string(),
  role: AgentRole,
  model: z.string(),
  effort: EffortLevel,
  departed: z.boolean(),
});
export type AgentScore = z.infer<typeof AgentScore>;

export const ReviewerScore = z.object({
  agentId: AgentId,
  name: z.string(),
  role: AgentRole,
  departed: z.boolean(),
  reviewed: z.int().nonnegative(),
  approved: z.int().nonnegative(),
  requestedChanges: z.int().nonnegative(),
  escapes: z.int().nonnegative(),
});
export type ReviewerScore = z.infer<typeof ReviewerScore>;

export const EvalFlag = z.enum(["failed", "blocked", "rated_bad", "rework", "retried"]);
export type EvalFlag = z.infer<typeof EvalFlag>;

export const EvalAttention = z.object({
  taskId: TaskId,
  title: z.string(),
  flag: EvalFlag,
  agent: z.string().nullable(),
  reviewRounds: z.int().nonnegative(),
  sessions: z.int().nonnegative(),
  detail: z.string(),
});
export type EvalAttention = z.infer<typeof EvalAttention>;

export const EvalInput = z.object({
  sinceHours: z
    .int()
    .positive()
    .max(24 * 365)
    .optional(),
  projectId: ProjectId.optional(),
});
export type EvalInput = z.infer<typeof EvalInput>;

export const RoleScore = Counts.extend({
  role: AgentRole,
  people: z.int().nonnegative(),
});
export type RoleScore = z.infer<typeof RoleScore>;

export const EvalScorecard = z.object({
  since: IsoDateTime.nullable(),
  until: IsoDateTime,
  office: Counts,
  agents: z.array(AgentScore),
  roles: z.array(RoleScore),
  reviewers: z.array(ReviewerScore),
  attention: z.array(EvalAttention),
});
export type EvalScorecard = z.infer<typeof EvalScorecard>;
