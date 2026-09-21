import { z } from "zod";
import { Attachments } from "./attachments.ts";
import {
  AgentId,
  ChatMessageId,
  ChatThreadId,
  MailItemId,
  MandateId,
  ProjectId,
  TaskId,
} from "./ids.ts";
import {
  AcceptancePolicy,
  ChatLanguage,
  EnvironmentPolicy,
  HiringPolicy,
  IntakePolicy,
  PreviewPolicy,
  PublishMode,
  PublishPolicy,
  ServicesPolicy,
  VerifyPolicy,
} from "./policies.ts";
import { AgentRole, ReviewPlan, TaskKind } from "./roles.ts";
import { TaskShape } from "./shape.ts";
import { Budgets } from "./usage.ts";

export * from "./policies.ts";
export * from "./usage.ts";

export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

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

export const EffortLevel = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type EffortLevel = z.infer<typeof EffortLevel>;

export const Gender = z.enum(["female", "male", "neutral"]);
export type Gender = z.infer<typeof Gender>;

export const ProviderId = z.enum(["claude-code", "opencode", "gemini-cli", "codex"]);
export type ProviderId = z.infer<typeof ProviderId>;

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

export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
  z.object({ kind: z.literal("system") }),
]);
export type Actor = z.infer<typeof Actor>;

export const HUMAN_ACTOR = { kind: "human" } as const satisfies Actor;
export const SYSTEM_ACTOR = { kind: "system" } as const satisfies Actor;

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

const Appearance = z.object({ gender: Gender });
type Appearance = z.infer<typeof Appearance>;

const TaskSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat"), messageId: ChatMessageId }),
  z.object({
    kind: z.literal("mail"),
    connector: z.string().min(1),
    externalId: z.string().min(1),
  }),
  z.object({ kind: z.literal("delegation"), byAgentId: AgentId, parentTaskId: TaskId.optional() }),
  z.object({ kind: z.literal("mandate"), mandateId: MandateId }),
  z.object({ kind: z.literal("manual") }),
]);
type TaskSource = z.infer<typeof TaskSource>;

const CRITERIA_MAX = 12;

export const TaskSpec = z.object({
  goal: z.string().min(1).max(500),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).min(1).max(CRITERIA_MAX),
  constraints: z.array(z.string().min(1).max(500)).max(CRITERIA_MAX).default([]),
  outOfScope: z.array(z.string().min(1).max(500)).max(CRITERIA_MAX).default([]),
});
export type TaskSpec = z.infer<typeof TaskSpec>;

export const REPORT_MAX = 4000;

export const CommitSha = z.string().regex(/^[0-9a-f]{40}$/u);
export type CommitSha = z.infer<typeof CommitSha>;

export const TaskArtifacts = z.object({
  branch: z.string().min(1).optional(),
  commit: CommitSha.optional(),
  prUrl: z.url().optional(),
  report: z.string().max(REPORT_MAX).optional(),
});
export type TaskArtifacts = z.infer<typeof TaskArtifacts>;

const TaskNoteKind = z.enum(["handoff", "review", "question", "answer", "report", "info"]);

export const NOTE_MAX = 8000;

export const BRIEF_MAX = 24_000;

export const DEPENDENCIES_MAX = 20;

export const TaskNote = z.object({
  at: IsoDateTime,
  author: Actor,
  kind: TaskNoteKind,
  text: z.string().min(1).max(NOTE_MAX),
  commit: CommitSha.optional(),
});
export type TaskNote = z.infer<typeof TaskNote>;

const Author = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
]);

export const Project = z.object({
  id: ProjectId,
  name: z.string().min(1).max(80),
  repo: RepoSource,
  defaultBranch: z.string().min(1).default("main"),
  language: ChatLanguage.default("en"),
  publish: PublishPolicy.prefault({}),
  intake: IntakePolicy.prefault({}),
  hiring: HiringPolicy.prefault({}),
  preview: PreviewPolicy.prefault({}),
  services: ServicesPolicy.prefault({}),
  verify: VerifyPolicy.prefault({}),
  acceptance: AcceptancePolicy.prefault({}),
  environment: EnvironmentPolicy.prefault({}),
  staffedAt: IsoDateTime.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Project = z.infer<typeof Project>;

export const BASE_PROMPT_MAX = 4000;

export const Agent = z.object({
  id: AgentId,
  name: z.string().min(1).max(60),
  role: AgentRole,
  appearance: Appearance,
  provider: ProviderId,
  auth: AuthKind.default("subscription"),
  model: z.string().min(1),
  effort: EffortLevel,
  basePrompt: z.string().max(BASE_PROMPT_MAX).default(""),
  skillPack: z.string().min(1).default("none"),
  budgets: Budgets,
  projectId: ProjectId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Agent = z.infer<typeof Agent>;

export const TaskRating = z.object({
  verdict: z.enum(["good", "bad"]),
  note: z.string().max(2000).default(""),
  at: IsoDateTime,
});
export type TaskRating = z.infer<typeof TaskRating>;

export const Task = z.object({
  id: TaskId,
  projectId: ProjectId,
  mandateId: MandateId.optional(),
  kind: TaskKind.default("work"),
  title: z.string().min(1).max(200),
  brief: z.string().max(BRIEF_MAX),
  spec: TaskSpec.optional(),
  status: TaskStatus,
  assigneeId: AgentId.optional(),
  reviewerId: AgentId.optional(),
  publish: PublishMode.optional(),
  browser: z.boolean().optional(),
  reviews: ReviewPlan.prefault({}),
  shape: TaskShape.default("routine"),
  rating: TaskRating.optional(),
  reviewRounds: z.int().nonnegative().default(0),
  notes: z.array(TaskNote).default([]),
  dependsOn: z.array(TaskId).max(DEPENDENCIES_MAX).default([]),
  source: TaskSource,
  artifacts: TaskArtifacts,
  priority: TaskPriority,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Task = z.infer<typeof Task>;

export const ChatMessage = z.object({
  id: ChatMessageId,
  projectId: ProjectId,
  author: Author,
  text: z.string().min(1).max(20_000),
  attachments: Attachments,
  taskId: TaskId.optional(),
  threadId: ChatThreadId.optional(),
  at: IsoDateTime,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const MailOutcome = z.enum(["received", "delegated", "done", "blocked", "failed"]);
export type MailOutcome = z.infer<typeof MailOutcome>;

export const MailAck = z.object({
  at: IsoDateTime,
  outcome: MailOutcome,
  detail: z.string().max(4000),
});
export type MailAck = z.infer<typeof MailAck>;

export const MailItem = z.object({
  id: MailItemId,
  projectId: ProjectId,
  connector: z.string().min(1),
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
