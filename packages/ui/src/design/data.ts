import type {
  AgentId,
  AuthKind,
  Gender,
  Attachment,
  ChatMessageId,
  ProjectId,
  TaskId,
  TaskStatus,
  AgentRole,
} from "@ho/protocol";

/**
 * The shapes the drawing is made of. They are narrower than the domain on purpose — the office was drawn
 * with three lanes and two moods — and `live.ts` is the single place that translates one into the other.
 */

/** The lanes the board draws, which the nine task states fold into. */
export type Lane = "queued" | "running" | "blocked" | "done";

export type Priority = "high" | "normal" | "low";
type Presence = "working" | "idle";

export type Member = {
  id: AgentId;
  /** The initial the avatar carries. */
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
};

export type Card = {
  id: TaskId;
  /** Title. */
  t: string;
  p: Priority;
  k: "code" | "triage";
  /** The assignee's name, empty when nobody has it yet. */
  who: string;
  s: Lane;
  /** The state the lane was folded from, for anything that needs the whole truth. */
  status: TaskStatus;
  /** The acceptance criteria the boss delegated with; empty for a task a human typed. */
  criteria: readonly string[];
  at: string;
};

export type Message = {
  id: ChatMessageId;
  mine: boolean;
  who?: string;
  time: string;
  text: string;
  attachment?: Attachment;
};

export type Floor = {
  id: ProjectId;
  name: string;
  path: string;
  pr: boolean;
  issues: boolean;
  services: boolean;
  /** The floor's own checks, as its `.ho/config.json` states them; empty means no gate. */
  verify: string;
  team: Member[];
  cards: Card[];
  messages: Message[];
};
