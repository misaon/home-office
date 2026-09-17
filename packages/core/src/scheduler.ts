import {
  type AgentId,
  MODE_OF_KIND,
  type Project,
  type SessionMode,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { activeSessions } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";

type SessionStart = { taskId: TaskId; agentId: AgentId; mode: SessionMode };

type SessionSkip = { taskId: TaskId; agentId: AgentId; reason: string };

export type SessionPlan = { starts: SessionStart[]; skipped: SessionSkip[]; capacity: number };

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

const SERVICES_COST = 2;

export const needsEngine = (
  daemonEnabled: boolean,
  project: Pick<Project, "services">,
  mode: SessionMode,
): boolean => daemonEnabled && project.services.enabled && (mode === "work" || mode === "review");

const costOf = (
  model: ReadModel,
  session: { taskId: TaskId; mode: SessionMode },
  daemonEnabled: boolean,
): number => {
  const task = model.tasks.get(session.taskId);
  const project = task === undefined ? undefined : model.projects.get(task.projectId);
  return project !== undefined && needsEngine(daemonEnabled, project, session.mode)
    ? SERVICES_COST
    : 1;
};

const candidateOf = (task: Task): SessionStart | null => {
  if (task.status === "assigned" && task.assigneeId !== undefined) {
    return {
      taskId: task.id,
      agentId: task.assigneeId,
      mode: MODE_OF_KIND[task.kind],
    };
  }
  if (task.status === "review" && task.reviewerId !== undefined) {
    return { taskId: task.id, agentId: task.reviewerId, mode: "review" };
  }
  return null;
};

export function planSessionStarts(
  model: ReadModel,
  maxConcurrentSessions: number,
  servicesEnabled: boolean,
): SessionPlan {
  const active = activeSessions(model);
  const busyTasks = new Set(active.map((s) => s.taskId));
  const perAgent = new Map<AgentId, number>();
  for (const session of active) {
    perAgent.set(session.agentId, (perAgent.get(session.agentId) ?? 0) + 1);
  }
  let capacity =
    maxConcurrentSessions - active.reduce((sum, s) => sum + costOf(model, s, servicesEnabled), 0);
  const candidates = [...model.tasks.values()]
    .filter((t) => !busyTasks.has(t.id))
    .toSorted(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const starts: SessionStart[] = [];
  const skipped: SessionSkip[] = [];
  for (const task of candidates) {
    const start = candidateOf(task);
    if (start === null) {
      continue;
    }
    if (capacity <= 0) {
      skipped.push({ ...start, reason: "the office is at its concurrent-session limit" });
      continue;
    }
    const cost = costOf(model, start, servicesEnabled);
    if (cost > capacity) {
      skipped.push({
        ...start,
        reason: `needs ${String(cost)} slots, ${String(capacity)} left`,
      });
      continue;
    }
    const agent = model.agents.get(start.agentId);
    if (agent === undefined) {
      skipped.push({ ...start, reason: "no such agent" });
      continue;
    }
    if ((perAgent.get(start.agentId) ?? 0) >= agent.budgets.maxConcurrentSessions) {
      skipped.push({
        ...start,
        reason: `${agent.name} is at ${String(agent.budgets.maxConcurrentSessions)} concurrent session(s)`,
      });
      continue;
    }
    starts.push(start);
    perAgent.set(start.agentId, (perAgent.get(start.agentId) ?? 0) + 1);
    capacity -= cost;
  }
  return { starts, skipped, capacity };
}
