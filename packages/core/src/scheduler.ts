import type { AgentId, TaskId } from "@ho/protocol";
import { isSessionActive } from "./commands/sessions.ts";
import type { ReadModel } from "./model/read-model.ts";

export type SchedulerLimits = { maxConcurrentSessions: number };
export type SessionStart = { taskId: TaskId; agentId: AgentId };

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/**
 * Decides which assigned tasks get a session now. Pure: the daemon applies the decisions.
 * Order: priority, then age. Respects the global cap and each agent's own concurrency budget.
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
    .filter((t) => t.status === "assigned" && t.assigneeId !== undefined && !busyTasks.has(t.id))
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
    const agentId = task.assigneeId;
    if (agentId === undefined) {
      continue;
    }
    const agent = model.agents.get(agentId);
    if (
      agent === undefined ||
      (perAgent.get(agentId) ?? 0) >= agent.budgets.maxConcurrentSessions
    ) {
      continue;
    }
    starts.push({ taskId: task.id, agentId });
    perAgent.set(agentId, (perAgent.get(agentId) ?? 0) + 1);
    capacity -= 1;
  }
  return starts;
}
