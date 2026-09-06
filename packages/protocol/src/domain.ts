import { z } from "zod";
import { AgentId, ChatMessageId, ProjectId, SessionId, TaskId } from "./ids.ts";

export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

// ---- enumerations -------------------------------------------------------------------------------

export const TaskStatus = z.enum([
  "inbox",
  "planned",
  "assigned",
  "in_progress",
  "review",
  "done",
  "blocked",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(["low", "normal", "high"]);
export type TaskPriority = z.infer<typeof TaskPriority>;

/** `work` changes a repository; `triage` is the boss processing a chat message in the Lobby. */
export const TaskKind = z.enum(["work", "triage"]);
export type TaskKind = z.infer<typeof TaskKind>;

export const AgentRole = z.enum(["boss", "worker", "reviewer", "clerk"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const EffortLevel = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type EffortLevel = z.infer<typeof EffortLevel>;

export const Gender = z.enum(["female", "male", "neutral"]);
export type Gender = z.infer<typeof Gender>;

/** Which agent runtime drives the persona. More providers arrive with @ho/runtime-acp. */
export const ProviderId = z.enum(["claude-code"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const SessionState = z.enum([
  "starting",
  "running",
  "idle",
  "stopping",
  "stopped",
  "failed",
]);
export type SessionState = z.infer<typeof SessionState>;

/** What a session is for: doing the task, reviewing its branch, or triaging a chat message (boss). */
export const SessionMode = z.enum(["work", "review", "triage"]);
export type SessionMode = z.infer<typeof SessionMode>;

/** Who caused something. Agents act through the daemon; the daemon itself is `system`. */
export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
  z.object({ kind: z.literal("system") }),
]);
export type Actor = z.infer<typeof Actor>;

// ---- value objects ------------------------------------------------------------------------------

/** `none` is the office itself (the Lobby floor): no repository, home of triage tasks. */
export const RepoSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), path: z.string().min(1) }),
  z.object({ kind: z.literal("git"), url: z.url() }),
  z.object({ kind: z.literal("none") }),
]);
export type RepoSource = z.infer<typeof RepoSource>;

/** How finished work leaves the sandbox: a branch in the repository, or additionally a GitHub pull request via `gh`. */
export const PublishPolicy = z.object({
  mode: z.enum(["branch", "pull-request"]).default("branch"),
  draft: z.boolean().default(true),
});
export type PublishPolicy = z.infer<typeof PublishPolicy>;

export const Budgets = z.object({
  maxTurnsPerTask: z.int().positive().default(60),
  maxConcurrentSessions: z.int().positive().default(1),
  maxWallMinutes: z.int().positive().default(60),
  maxReviewRounds: z.int().nonnegative().default(2),
});
export type Budgets = z.infer<typeof Budgets>;

export const Appearance = z.object({
  spriteSet: z.string().min(1),
  gender: Gender,
});
export type Appearance = z.infer<typeof Appearance>;

export const Usage = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  turns: z.int().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

export const TaskSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat"), messageId: ChatMessageId }),
  z.object({
    kind: z.literal("mail"),
    connector: z.string().min(1),
    externalId: z.string().min(1),
  }),
  z.object({ kind: z.literal("delegation"), byAgentId: AgentId, parentTaskId: TaskId.optional() }),
  z.object({ kind: z.literal("manual") }),
]);
export type TaskSource = z.infer<typeof TaskSource>;

export const TaskArtifacts = z.object({
  branch: z.string().min(1).optional(),
  prUrl: z.url().optional(),
  report: z.string().max(4000).optional(),
});
export type TaskArtifacts = z.infer<typeof TaskArtifacts>;

/** Appended context a resumed session must see: handoffs, review findings, questions and answers, reports. */
export const TaskNoteKind = z.enum(["handoff", "review", "question", "answer", "report", "info"]);
export type TaskNoteKind = z.infer<typeof TaskNoteKind>;

export const TaskNote = z.object({
  at: IsoDateTime,
  author: Actor,
  kind: TaskNoteKind,
  text: z.string().min(1).max(8000),
});
export type TaskNote = z.infer<typeof TaskNote>;

export const Author = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
]);
export type Author = z.infer<typeof Author>;

// ---- entities -----------------------------------------------------------------------------------

export const Project = z.object({
  id: ProjectId,
  name: z.string().min(1).max(80),
  repo: RepoSource,
  defaultBranch: z.string().min(1).default("main"),
  floorTemplateId: z.string().min(1).default("project-default"),
  publish: PublishPolicy.prefault({}),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Project = z.infer<typeof Project>;

export const Agent = z.object({
  id: AgentId,
  name: z.string().min(1).max(60),
  role: AgentRole,
  appearance: Appearance,
  provider: ProviderId,
  model: z.string().min(1),
  effort: EffortLevel,
  basePrompt: z.string().max(4000).default(""),
  skillPack: z.string().min(1).default("none"),
  budgets: Budgets,
  projectIds: z.array(ProjectId).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Agent = z.infer<typeof Agent>;

export const Task = z.object({
  id: TaskId,
  projectId: ProjectId,
  parentId: TaskId.optional(),
  kind: TaskKind.default("work"),
  title: z.string().min(1).max(200),
  brief: z.string().max(20000),
  status: TaskStatus,
  assigneeId: AgentId.optional(),
  reviewerId: AgentId.optional(),
  reviewRounds: z.int().nonnegative().default(0),
  notes: z.array(TaskNote).default([]),
  source: TaskSource,
  artifacts: TaskArtifacts,
  priority: TaskPriority,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Task = z.infer<typeof Task>;

export const ChatMessage = z.object({
  id: ChatMessageId,
  author: Author,
  text: z.string().min(1).max(20000),
  taskId: TaskId.optional(),
  at: IsoDateTime,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const Session = z.object({
  id: SessionId,
  taskId: TaskId,
  agentId: AgentId,
  mode: SessionMode.default("work"),
  state: SessionState,
  runtimeSessionId: z.string().optional(),
  sandboxId: z.string().optional(),
  /** Earlier session of the same task and agent whose conversation this one resumed. */
  resumedFrom: SessionId.optional(),
  usage: Usage,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
});
export type Session = z.infer<typeof Session>;
