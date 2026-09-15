import { z } from "zod";
import { Attachments } from "./attachments.ts";
import { AgentId, ChatMessageId, MailItemId, ProjectId, SessionId, TaskId } from "./ids.ts";
import { IntakePolicy, PublishPolicy, ServicesPolicy } from "./policies.ts";

/** The per-project policies live in their own module; this one keeps them part of the domain surface. */
export * from "./policies.ts";

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

/** `work` changes the repository; `triage` is the floor's boss planning a chat message or a mail item. */
const TaskKind = z.enum(["work", "triage"]);
type TaskKind = z.infer<typeof TaskKind>;

export const AgentRole = z.enum(["boss", "worker", "reviewer", "clerk"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const EffortLevel = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type EffortLevel = z.infer<typeof EffortLevel>;

export const Gender = z.enum(["female", "male", "neutral"]);
export type Gender = z.infer<typeof Gender>;

/** Which agent runtime drives a persona. Claude Code speaks stream-json; the others speak ACP (see providers.ts). */
export const ProviderId = z.enum(["claude-code", "opencode", "gemini-cli", "codex"]);
export type ProviderId = z.infer<typeof ProviderId>;

/** How a session signs in: the owner's subscription token, an API key from the secret store, or nothing (local models). */
export const AuthKind = z.enum(["subscription", "api-key", "none"]);
export type AuthKind = z.infer<typeof AuthKind>;

export const SessionState = z.enum([
  "starting",
  "running",
  "idle",
  "stopping",
  "stopped",
  "failed",
]);
export type SessionState = z.infer<typeof SessionState>;

export const isSessionActive = (state: SessionState): boolean =>
  state !== "stopped" && state !== "failed";

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

export const HUMAN_ACTOR = { kind: "human" } as const satisfies Actor;
export const SYSTEM_ACTOR = { kind: "system" } as const satisfies Actor;

// ---- value objects ------------------------------------------------------------------------------

/** Every project (floor) has a repository: a checkout on this machine or a git URL mirrored by the daemon. */
export const RepoSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), path: z.string().min(1) }),
  z.object({
    kind: z.literal("git"),
    url: z
      .url()
      .regex(
        /^(?:https:\/\/[^/@?#]+|ssh:\/\/(?:[^:/@?#]+@)?[^/@?#]+)(?:[/?#]|$)/u,
        "use an HTTPS or SSH repository URL without embedded credentials",
      ),
  }),
]);
export type RepoSource = z.infer<typeof RepoSource>;

export const Budgets = z.object({
  maxTurnsPerTask: z.int().positive().default(60),
  maxConcurrentSessions: z.int().positive().default(1),
  maxWallMinutes: z.int().positive().default(60),
  maxReviewRounds: z.int().nonnegative().default(2),
  /** API-key sessions only (Claude Code `--max-budget-usd`); subscriptions have no per-task price. */
  maxUsdPerTask: z.number().positive().optional(),
});
export type Budgets = z.infer<typeof Budgets>;

const Appearance = z.object({ gender: Gender });
type Appearance = z.infer<typeof Appearance>;

export const Usage = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  turns: z.int().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
};

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  turns: a.turns + b.turns,
});

const TaskSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat"), messageId: ChatMessageId }),
  // A stored event is read back as it was written, so the connector id is not narrowed here; the
  // intake inputs are where a new one is checked.
  z.object({
    kind: z.literal("mail"),
    connector: z.string().min(1),
    externalId: z.string().min(1),
  }),
  z.object({ kind: z.literal("delegation"), byAgentId: AgentId, parentTaskId: TaskId.optional() }),
  z.object({ kind: z.literal("manual") }),
]);
type TaskSource = z.infer<typeof TaskSource>;

export const TaskArtifacts = z.object({
  branch: z.string().min(1).optional(),
  prUrl: z.url().optional(),
  report: z.string().max(4000).optional(),
});
export type TaskArtifacts = z.infer<typeof TaskArtifacts>;

/** Appended context a resumed session must see: handoffs, review findings, questions and answers, reports. */
const TaskNoteKind = z.enum(["handoff", "review", "question", "answer", "report", "info"]);

/** The longest a note on a task can be; longer text is clipped by whoever writes it. */
export const NOTE_MAX = 8000;

export const TaskNote = z.object({
  at: IsoDateTime,
  author: Actor,
  kind: TaskNoteKind,
  text: z.string().min(1).max(NOTE_MAX),
});
export type TaskNote = z.infer<typeof TaskNote>;

const Author = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
]);

// ---- entities -----------------------------------------------------------------------------------

/** A project is one floor of the office (D23): the same plan, its own boss and staff. */
export const Project = z.object({
  id: ProjectId,
  name: z.string().min(1).max(80),
  repo: RepoSource,
  defaultBranch: z.string().min(1).default("main"),
  publish: PublishPolicy.prefault({}),
  intake: IntakePolicy.prefault({}),
  services: ServicesPolicy.prefault({}),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Project = z.infer<typeof Project>;

/**
 * How long a colleague's own briefing may be. Anthropic caps the instructions that shape a persona at
 * 1 500 characters for a profile and 3 000 for an organisation, and allows about 8 000 in a project
 * (support.anthropic.com and the Claude custom-instructions guide, read 2026-09-15). This sits between
 * them: long enough for habits and constraints, short enough that it does not crowd out the task.
 */
export const BASE_PROMPT_MAX = 4000;

export const Agent = z.object({
  id: AgentId,
  name: z.string().min(1).max(60),
  role: AgentRole,
  appearance: Appearance,
  provider: ProviderId,
  /** Existing agents predate this field and were all Claude Code on the subscription. */
  auth: AuthKind.default("subscription"),
  model: z.string().min(1),
  effort: EffortLevel,
  basePrompt: z.string().max(BASE_PROMPT_MAX).default(""),
  skillPack: z.string().min(1).default("none"),
  budgets: Budgets,
  /** The floor this agent works on; every floor has exactly one boss and any number of staff. */
  projectId: ProjectId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Agent = z.infer<typeof Agent>;

export const Task = z.object({
  id: TaskId,
  projectId: ProjectId,
  kind: TaskKind.default("work"),
  title: z.string().min(1).max(200),
  brief: z.string().max(20_000),
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

/** One line of a floor's chat between the human and that floor's boss. */
export const ChatMessage = z.object({
  id: ChatMessageId,
  projectId: ProjectId,
  author: Author,
  text: z.string().min(1).max(20_000),
  /** Files the office keeps beside the log; the message carries only their descriptors. */
  attachments: Attachments,
  taskId: TaskId.optional(),
  at: IsoDateTime,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** What the office told the source about a mail item (issue comment, label). */
export const MailOutcome = z.enum(["received", "delegated", "done", "blocked", "failed"]);
export type MailOutcome = z.infer<typeof MailOutcome>;

export const MailAck = z.object({
  at: IsoDateTime,
  outcome: MailOutcome,
  detail: z.string().max(4000),
});
export type MailAck = z.infer<typeof MailAck>;

/** One item the postman brought in: an issue that became a task. Bodies live in the task brief, not here. */
export const MailItem = z.object({
  id: MailItemId,
  projectId: ProjectId,
  connector: z.string().min(1),
  /** Stable id at the source (the issue number); dedupes polls. */
  externalId: z.string().min(1).max(100),
  url: z.url(),
  title: z.string().min(1).max(300),
  author: z.string().max(100),
  labels: z.array(z.string().max(50)),
  receivedAt: IsoDateTime,
  taskId: TaskId.optional(),
  acks: z.array(MailAck).default([]),
});
export type MailItem = z.infer<typeof MailItem>;

/** Whether this session got the private container engine its project asks for; absent means none. */
export const SessionServices = z.enum(["ready", "failed"]);
export type SessionServices = z.infer<typeof SessionServices>;

export const Session = z.object({
  id: SessionId,
  taskId: TaskId,
  agentId: AgentId,
  mode: SessionMode.default("work"),
  state: SessionState,
  runtimeSessionId: z.string().optional(),
  sandboxId: z.string().optional(),
  services: SessionServices.optional(),
  /** Earlier session of the same task and agent whose conversation this one resumed. */
  resumedFrom: SessionId.optional(),
  usage: Usage,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
});
export type Session = z.infer<typeof Session>;
