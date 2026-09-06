import type { AgentId, SessionMode, Task, TaskId } from "@ho/protocol";
import { isSessionActive } from "./commands/sessions.ts";
import type { ReadModel } from "./model/read-model.ts";

export type SchedulerLimits = { maxConcurrentSessions: number };
export type SessionStart = { taskId: TaskId; agentId: AgentId; mode: SessionMode };

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

const candidateOf = (task: Task): SessionStart | null => {
  if (task.status === "assigned" && task.assigneeId !== undefined) {
    return {
      taskId: task.id,
      agentId: task.assigneeId,
      mode: task.kind === "triage" ? "triage" : "work",
    };
  }
  if (task.status === "review" && task.reviewerId !== undefined) {
    return { taskId: task.id, agentId: task.reviewerId, mode: "review" };
  }
  return null;
};

/**
 * Decides which tasks get a session now: assigned tasks (work or triage) and tasks awaiting their reviewer.
 * Pure: the daemon applies the decisions. Order: priority, then age. Respects the global cap and each agent's budget.
 */
export function planSessionStarts(model: ReadModel, limits: SchedulerLimits): SessionStart[] {
  const active = [...model.sessions.values()].filter((s) => isSessionActive(s.state));
  const busyTasks = new Set(active.map((s) => s.taskId));
  const perAgent = new Map<AgentId, number>();
  for (const session of active) {
    perAgent.set(session.agentId, (perAgent.get(session.agentId) ?? 0) + 1);
  }
  let capacity = limits.maxConcurrentSessions - active.length;
  const candidates = [...model.tasks.values()]
    .filter((t) => !busyTasks.has(t.id))
    .toSorted(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const starts: SessionStart[] = [];
  for (const task of candidates) {
    if (capacity <= 0) {
      break;
    }
    const start = candidateOf(task);
    if (start === null) {
      continue;
    }
    const agent = model.agents.get(start.agentId);
    if (
      agent === undefined ||
      (perAgent.get(start.agentId) ?? 0) >= agent.budgets.maxConcurrentSessions
    ) {
      continue;
    }
    starts.push(start);
    perAgent.set(start.agentId, (perAgent.get(start.agentId) ?? 0) + 1);
    capacity -= 1;
  }
  return starts;
}
