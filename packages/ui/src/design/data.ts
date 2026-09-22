import type {
  AgentId,
  AuthKind,
  BudgetGuarantees,
  Budgets,
  Gender,
  Attachment,
  ChatMessageId,
  EvidenceBlocker,
  EvidenceFidelity,
  TaskShape,
  ChatThreadId,
  MandateId,
  MandateStatus,
  ProjectId,
  RepositoryTrust,
  ReviewPlan,
  ReviewStage,
  TaskId,
  TaskStatus,
  AgentRole,
  SessionId,
  SessionMode,
} from "@ho/protocol";
import type { Step } from "./transcript.ts";

export type Lane = "queued" | "running" | "blocked" | "done";

export type Priority = "high" | "normal" | "low";
type Presence = "working" | "idle";

export type Member = {
  id: AgentId;
  initial: string;
  name: string;
  role: AgentRole;
  provider: string;
  auth: AuthKind;
  gender: Gender;
  model: string;
  effort: string;
  status: Presence;
  doing: string;
  since: string;
  prompt: string;
  budgets: Budgets;
  guarantees: BudgetGuarantees;
};

type CardKind = "code" | "triage" | "plan" | "verify";

export type CriterionEvidence = {
  mark: "pass" | "fail" | "claimed" | "open";
  by: string;
  method: string;
  proof: string;
  fidelity: EvidenceFidelity | null;
  blocker: EvidenceBlocker | null;
  files: readonly Attachment[];
};

export type Card = {
  id: TaskId;
  title: string;
  priority: Priority;
  kind: CardKind;
  who: string;
  lane: Lane;
  status: TaskStatus;
  criteria: readonly string[];
  evidence: readonly CriterionEvidence[];
  request: string | null;
  rating: "good" | "bad" | null;
  commit: string | null;
  buildsOn: readonly string[];
  reviews: ReviewPlan;
  shape: TaskShape;
  missingReviews: readonly ReviewStage[];
  at: string;
};

type RequestTask = {
  id: TaskId;
  title: string;
  kind: CardKind;
  status: TaskStatus;
  who: string;
};

export type Request = {
  id: MandateId;
  title: string;
  request: string;
  status: MandateStatus;
  round: number;
  conditions: readonly { text: string; evidence: CriterionEvidence }[];
  tasks: readonly RequestTask[];
  prUrl: string | null;
  branch: string | null;
  when: string;
  open: boolean;
  progress: { done: number; total: number };
};

export type Message = {
  id: ChatMessageId;
  mine: boolean;
  who?: string;
  role?: AgentRole;
  kind?: "status";
  at: string;
  time: string;
  text: string;
  threadId?: ChatThreadId;
  asks?: { taskId: TaskId; who: string };
  tone?: "trouble";
  attachments: readonly Attachment[];
};

export type SessionOutcome = "running" | "done" | "failed";

export type SessionCard = {
  id: SessionId;
  agentId: AgentId;
  taskId: TaskId;
  name: string;
  initial: string;
  role: AgentRole;
  mode: SessionMode;
  model: string;
  effort: string;
  live: boolean;
  outcome: SessionOutcome;
  startedAt: string;
  since: string;
  costUsd: number | null;
  turns: number;
  taskTitle: string;
  traced: boolean;
  steps: readonly Step[];
  activity: string | null;
  text: string;
};

export type ThreadPick = ChatThreadId | "main";

export type Thread = {
  id: ThreadPick;
  title: string;
  count: number;
  at: string;
  when: string;
};

export type Floor = {
  id: ProjectId;
  name: string;
  path: string;
  pr: boolean;
  issues: boolean;
  services: boolean;
  trust: RepositoryTrust;
  preview: { enabled: boolean; port: number };
  hiring: boolean;
  verify: string;
  team: Member[];
  cards: Card[];
  messages: Message[];
  threads: Thread[];
};
