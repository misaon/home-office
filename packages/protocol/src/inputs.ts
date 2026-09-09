import { z } from "zod";
import {
  Agent,
  AuthKind,
  Budgets,
  IntakePolicy,
  IsoDateTime,
  Project,
  PublishPolicy,
  RepoSource,
  TaskArtifacts,
  TaskPriority,
  TaskStatus,
  Usage,
} from "./domain.ts";
import { AgentId, ProjectId, SessionId, TaskId } from "./ids.ts";

// ---- inputs -------------------------------------------------------------------------------------

const ProjectFields = Project.pick({
  name: true,
  repo: true,
  defaultBranch: true,
  publish: true,
  intake: true,
});
/**
 * A new floor. The daemon creates its boss (Andrew) in the same command; `importAgentIds` copies characters
 * from other floors onto this one (bosses are skipped, the new floor has its own).
 */
export const ProjectCreateInput = ProjectFields.extend({
  importAgentIds: z.array(AgentId).default([]),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>;
/** What the daemon learns about a repository before it becomes a floor: a git check, a name and its branch. */
export const RepoInspectInput = z.object({ repo: RepoSource });
export type RepoInspectInput = z.infer<typeof RepoInspectInput>;
export const RepoInspection = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    name: z.string().min(1),
    defaultBranch: z.string().min(1),
    repo: RepoSource,
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type RepoInspection = z.infer<typeof RepoInspection>;
/**
 * Patches carry only the keys a client sent. `.partial()` alone would re-apply field defaults to absent
 * keys, so defaulted fields are unwrapped here (a patch of `{ name }` must not reset the branch or policy).
 */
const ProjectPatch = z
  .object({
    name: Project.shape.name,
    repo: Project.shape.repo,
    defaultBranch: Project.shape.defaultBranch.unwrap(),
    publish: PublishPolicy,
    intake: IntakePolicy,
  })
  .partial();
export const ProjectUpdateInput = z.object({ id: ProjectId, patch: ProjectPatch });
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

const AgentFields = Agent.pick({
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
  /** Omitted: the provider's default (subscription for Claude Code, API key elsewhere). */
  auth: AuthKind.optional(),
  budgets: Budgets.prefault({}),
});
export const AgentCreateInput = AgentFields;
export type AgentCreateInput = z.infer<typeof AgentCreateInput>;
/** See ProjectPatch: a model change must keep the persona, skill pack, projects and budgets. */
const AgentPatch = z
  .object({
    name: Agent.shape.name,
    role: Agent.shape.role,
    appearance: Agent.shape.appearance,
    provider: Agent.shape.provider,
    auth: AuthKind,
    model: Agent.shape.model,
    effort: Agent.shape.effort,
    basePrompt: Agent.shape.basePrompt.unwrap(),
    skillPack: Agent.shape.skillPack.unwrap(),
    budgets: Budgets,
  })
  .partial();
export const AgentUpdateInput = z.object({ id: AgentId, patch: AgentPatch });
export type AgentUpdateInput = z.infer<typeof AgentUpdateInput>;
/** Copies a character onto another floor: same persona, appearance, model and budgets, a new id. */
export const AgentCopyInput = z.object({
  id: AgentId,
  projectId: ProjectId,
  /** Defaults to the original's name (names are unique per floor). */
  name: Agent.shape.name.optional(),
});
export type AgentCopyInput = z.infer<typeof AgentCopyInput>;
export const AgentListInput = z.object({ projectId: ProjectId.optional() });
export type AgentListInput = z.infer<typeof AgentListInput>;

export const TaskCreateInput = z.object({
  projectId: ProjectId,
  title: z.string().min(1).max(200),
  brief: z.string().max(20000).default(""),
  priority: TaskPriority.default("normal"),
  parentId: TaskId.optional(),
  assigneeId: AgentId.optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export const TaskListInput = z.object({
  projectId: ProjectId.optional(),
  status: z.array(TaskStatus).min(1).optional(),
});
export type TaskListInput = z.infer<typeof TaskListInput>;
export const TaskEditInput = z.object({
  id: TaskId,
  title: z.string().min(1).max(200).optional(),
  brief: z.string().max(20000).optional(),
  priority: TaskPriority.optional(),
});
export type TaskEditInput = z.infer<typeof TaskEditInput>;
export const TaskAssignInput = z.object({ id: TaskId, agentId: AgentId.nullable() });
export type TaskAssignInput = z.infer<typeof TaskAssignInput>;
export const TaskTransitionInput = z.object({
  id: TaskId,
  to: TaskStatus,
  reason: z.string().max(2000).optional(),
});
export type TaskTransitionInput = z.infer<typeof TaskTransitionInput>;
export const TaskArtifactsInput = z.object({ id: TaskId, artifacts: TaskArtifacts });
export type TaskArtifactsInput = z.infer<typeof TaskArtifactsInput>;

/**
 * A message to a floor's boss (`projectId`), who triages it, or an answer to a question an agent asked about a
 * task (`taskId`), which resumes that task. Exactly one of the two.
 */
export const ChatSendInput = z
  .object({
    text: z.string().trim().min(1).max(20000),
    projectId: ProjectId.optional(),
    taskId: TaskId.optional(),
  })
  .refine(
    (input) => (input.projectId === undefined) !== (input.taskId === undefined),
    "specify exactly one of projectId or taskId",
  );
export type ChatSendInput = z.infer<typeof ChatSendInput>;
export const ChatHistoryInput = z.object({
  projectId: ProjectId.optional(),
  limit: z.int().positive().max(500).default(100),
});
export type ChatHistoryInput = z.infer<typeof ChatHistoryInput>;

export const SessionListInput = z.object({
  taskId: TaskId.optional(),
  active: z.boolean().optional(),
});
export type SessionListInput = z.infer<typeof SessionListInput>;
export const SessionStreamInput = z.object({ sessionId: SessionId.optional() });
export type SessionStreamInput = z.infer<typeof SessionStreamInput>;

export const UsageSummaryInput = z.object({
  sinceHours: z
    .number()
    .positive()
    .max(24 * 365)
    .optional(),
});
export type UsageSummaryInput = z.infer<typeof UsageSummaryInput>;
export const UsageBucket = z.object({
  key: z.string(),
  label: z.string(),
  usage: Usage,
  sessions: z.int().nonnegative(),
});
export type UsageBucket = z.infer<typeof UsageBucket>;
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
export type EventsSubscribeInput = z.infer<typeof EventsSubscribeInput>;

export const Health = z.object({
  ok: z.literal(true),
  version: z.string(),
  startedAt: IsoDateTime,
  uptimeMs: z.int().nonnegative(),
});
export type Health = z.infer<typeof Health>;
