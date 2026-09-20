import type {
  AgentId,
  AuthKind,
  BudgetGuarantees,
  Budgets,
  Gender,
  Attachment,
  ChatMessageId,
  ChatThreadId,
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
  i: string;
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

export type Card = {
  id: TaskId;
  t: string;
  p: Priority;
  k: "code" | "triage" | "plan";
  who: string;
  s: Lane;
  status: TaskStatus;
  criteria: readonly string[];
  rating: "good" | "bad" | null;
  commit: string | null;
  buildsOn: readonly string[];
  reviews: ReviewPlan;
  missingReviews: readonly ReviewStage[];
  at: string;
};

export type Message = {
  id: ChatMessageId;
  mine: boolean;
  who?: string;
  time: string;
  text: string;
  threadId?: ChatThreadId;
  asks?: { taskId: TaskId; who: string };
  attachment?: Attachment;
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
