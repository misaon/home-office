import type { TaskStatus } from "@ho/protocol";

/** The task state machine. Terminal states have no outgoing edges. */
const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  inbox: ["planned", "assigned", "blocked", "cancelled"],
  planned: ["assigned", "blocked", "cancelled"],
  assigned: ["in_progress", "planned", "blocked", "cancelled"],
  in_progress: ["review", "done", "blocked", "failed", "cancelled"],
  review: ["done", "in_progress", "blocked", "cancelled"],
  blocked: ["planned", "assigned", "in_progress", "cancelled"],
  failed: ["planned", "assigned", "cancelled"],
  done: [],
  cancelled: [],
};

export const canTransition = (from: TaskStatus, to: TaskStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const isTerminal = (status: TaskStatus): boolean => TRANSITIONS[status].length === 0;

/** Statuses in which an agent is expected to be working or about to. */
export const isActive = (status: TaskStatus): boolean =>
  status === "assigned" || status === "in_progress" || status === "review";
