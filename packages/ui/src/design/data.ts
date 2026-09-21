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
} from "@ho/protocol";

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
};

export type Message = {
  id: ChatMessageId;
  mine: boolean;
  who?: string;
  at: string;
  time: string;
  text: string;
  threadId?: ChatThreadId;
  asks?: { taskId: TaskId; who: string };
  attachments: readonly Attachment[];
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
