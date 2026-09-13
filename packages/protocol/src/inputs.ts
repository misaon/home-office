import { z } from "zod";
import { Attachments } from "./attachments.ts";
import {
  Agent,
  AuthKind,
  Budgets,
  IntakePolicy,
  IsoDateTime,
  Project,
  PublishPolicy,
  RepoSource,
  ServicesPolicy,
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
  services: true,
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
/** How many branch names one inspection carries; a select does not need a huge repository's full list. */
export const REPO_BRANCH_LIMIT = 500;
export const RepoInspection = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    name: z.string().min(1),
    defaultBranch: z.string().min(1),
    /** Every branch git reported, the default first; the dialog offers these instead of free text. */
    branches: z.array(z.string().min(1)).max(REPO_BRANCH_LIMIT).default([]),
    repo: RepoSource,
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type RepoInspection = z.infer<typeof RepoInspection>;
/** Where the host's directory dialog opens; a path that is not a directory is ignored. */
export const DirectoryPickInput = z.object({ startIn: z.string().min(1).optional() });
export type DirectoryPickInput = z.infer<typeof DirectoryPickInput>;
/**
 * The result of the host's native directory dialog. `unavailable` is not a failure: a daemon on a host
 * without a dialog (another platform, or a future remote daemon) says so, and the path is typed instead.
 */
export const DirectoryPick = z.discriminatedUnion("status", [
  z.object({ status: z.literal("picked"), path: z.string().min(1) }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("unavailable"), message: z.string() }),
]);
export type DirectoryPick = z.infer<typeof DirectoryPick>;
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
    services: ServicesPolicy,
  })
  .partial();
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
  /** Omitted: the provider's default (subscription for Claude Code, API key elsewhere). */
  auth: AuthKind.optional(),
  budgets: Budgets.prefault({}),
});
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

export const TaskCreateInput = z.object({
  projectId: ProjectId,
  title: z.string().min(1).max(200),
  brief: z.string().max(20000).default(""),
  priority: TaskPriority.default("normal"),
  assigneeId: AgentId.optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
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

const ChatText = z.string().trim().min(1).max(20000);
/**
 * A message to a floor's boss (`projectId`), who triages it, or an answer to a question an agent asked about a
 * task (`taskId`), which resumes that task.
 */
export const ChatSendInput = z.union([
  z.object({ text: ChatText, projectId: ProjectId, attachments: Attachments }),
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
