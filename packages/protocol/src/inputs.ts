import { z } from "zod";
import { Attachments } from "./attachments.ts";
import {
  Agent,
  AuthKind,
  Budgets,
  HiringPolicy,
  IntakePolicy,
  IsoDateTime,
  Project,
  PreviewPolicy,
  PublishPolicy,
  RepoSource,
  ServicesPolicy,
  Task,
  TaskPriority,
  TaskRating,
  TaskStatus,
  Usage,
  VerifyPolicy,
} from "./domain.ts";
import { AgentId, ChatThreadId, ProjectId, SessionId, TaskId } from "./ids.ts";
import { patchOf } from "./patch.ts";
import { ReviewPlan } from "./roles.ts";

const ProjectFields = Project.pick({
  name: true,
  repo: true,
  defaultBranch: true,
  publish: true,
  intake: true,
  hiring: true,
  preview: true,
  services: true,
  verify: true,
});
export const ProjectCreateInput = ProjectFields.extend({
  importAgentIds: z.array(AgentId).default([]),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>;
export const RepoInspectInput = z.object({ repo: RepoSource });
export type RepoInspectInput = z.infer<typeof RepoInspectInput>;
export const REPO_BRANCH_LIMIT = 500;
export const RepoInspection = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    name: z.string().min(1),
    defaultBranch: z.string().min(1),
    branches: z.array(z.string().min(1)).max(REPO_BRANCH_LIMIT).default([]),
    repo: RepoSource,
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type RepoInspection = z.infer<typeof RepoInspection>;
export const DirectoryPickInput = z.object({ startIn: z.string().min(1).optional() });
export type DirectoryPickInput = z.infer<typeof DirectoryPickInput>;
export const DirectoryPick = z.discriminatedUnion("status", [
  z.object({ status: z.literal("picked"), path: z.string().min(1) }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("unavailable"), message: z.string() }),
]);
export type DirectoryPick = z.infer<typeof DirectoryPick>;
const ProjectPatch = patchOf(Project.pick({ name: true, repo: true, defaultBranch: true })).extend({
  publish: patchOf(PublishPolicy).optional(),
  intake: patchOf(IntakePolicy).optional(),
  hiring: patchOf(HiringPolicy).optional(),
  preview: patchOf(PreviewPolicy).optional(),
  services: patchOf(ServicesPolicy).optional(),
  verify: patchOf(VerifyPolicy).optional(),
});
export const ProjectUpdateInput = z.object({ id: ProjectId, patch: ProjectPatch });
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

export const AgentCreateInput = Agent.pick({
  name: true,
  role: true,
  appearance: true,
  provider: true,
  model: true,
  effort: true,
  basePrompt: true,
  skillPack: true,
  projectId: true,
}).extend({
  auth: AuthKind.optional(),
  budgets: Budgets.prefault({}),
});
export type AgentCreateInput = z.infer<typeof AgentCreateInput>;
const AgentPatch = patchOf(
  Agent.pick({
    name: true,
    role: true,
    appearance: true,
    provider: true,
    auth: true,
    model: true,
    effort: true,
    basePrompt: true,
    skillPack: true,
  }),
).extend({ budgets: patchOf(Budgets).optional() });
export const AgentUpdateInput = z.object({ id: AgentId, patch: AgentPatch });
export type AgentUpdateInput = z.infer<typeof AgentUpdateInput>;
export const AgentCopyInput = z.object({
  id: AgentId,
  projectId: ProjectId,
  name: Agent.shape.name.optional(),
});
export type AgentCopyInput = z.infer<typeof AgentCopyInput>;
export const AgentListInput = z.object({ projectId: ProjectId.optional() });

export const TaskCreateInput = z.object({
  projectId: ProjectId,
  title: Task.shape.title,
  brief: Task.shape.brief.default(""),
  priority: TaskPriority.default("normal"),
  assigneeId: AgentId.optional(),
  browser: z.boolean().optional(),
  reviews: ReviewPlan.optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export const TaskRateInput = z.object({
  id: TaskId,
  verdict: TaskRating.shape.verdict,
  note: TaskRating.shape.note,
});
export type TaskRateInput = z.infer<typeof TaskRateInput>;
export const TaskListInput = z.object({
  projectId: ProjectId.optional(),
  status: z.array(TaskStatus).min(1).optional(),
});
export const TaskAssignInput = z.object({ id: TaskId, agentId: AgentId.nullable() });
export type TaskAssignInput = z.infer<typeof TaskAssignInput>;
export const TaskTransitionInput = z.object({
  id: TaskId,
  to: TaskStatus,
  reason: z.string().max(2000).optional(),
});
export type TaskTransitionInput = z.infer<typeof TaskTransitionInput>;

const ChatText = z.string().trim().min(1).max(20_000);

export const ChatThreadTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("latest") }),
  z.object({ kind: z.literal("new") }),
  z.object({ kind: z.literal("thread"), id: ChatThreadId }),
]);
export type ChatThreadTarget = z.infer<typeof ChatThreadTarget>;

export const ChatClearInput = z.object({
  projectId: ProjectId,
  threadId: ChatThreadId.optional(),
});

export const ChatSendInput = z.union([
  z.object({
    text: ChatText,
    projectId: ProjectId,
    attachments: Attachments,
    thread: ChatThreadTarget.default({ kind: "latest" }),
  }),
  z.object({ text: ChatText, taskId: TaskId, attachments: Attachments }),
]);
export type ChatSendInput = z.infer<typeof ChatSendInput>;

export const SessionListInput = z.object({
  taskId: TaskId.optional(),
  active: z.boolean().optional(),
});
export const SessionStreamInput = z.object({ sessionId: SessionId.optional() });

export const UsageSummaryInput = z.object({
  sinceHours: z
    .number()
    .positive()
    .max(24 * 365)
    .optional(),
});
const UsageBucket = z.object({
  key: z.string(),
  label: z.string(),
  usage: Usage,
  sessions: z.int().nonnegative(),
});
export const UsageSummary = z.object({
  since: IsoDateTime.nullable(),
  totals: Usage,
  sessions: z.int().nonnegative(),
  rateLimitIncidents: z.int().nonnegative(),
  byAgent: z.array(UsageBucket),
  byProject: z.array(UsageBucket),
  byDay: z.array(UsageBucket),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

export const EventsSubscribeInput = z.object({ afterSeq: z.int().nonnegative().optional() });

export const Health = z.object({
  ok: z.literal(true),
  version: z.string(),
  startedAt: IsoDateTime,
  uptimeMs: z.int().nonnegative(),
});
export type Health = z.infer<typeof Health>;
