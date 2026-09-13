import type { AgentId, Project, SessionMode, Task, TaskId } from "@ho/protocol";
import { activeSessions } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";

export type SessionStart = { taskId: TaskId; agentId: AgentId; mode: SessionMode };

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/**
 * A session whose project runs its own container engine occupies two slots: measured, the engine needs
 * 2 GiB beside the sandbox's 3 GiB, and the supported host is one Docker VM with 7.75 GiB.
 */
const SERVICES_COST = 2;

/**
 * Whether a session gets its own container engine: the daemon's switch, the floor's setting, and the work
 * itself — triage is the boss planning a message, so it touches no code. The provisioner asks the same
 * question, so the two cannot drift.
 */
export const needsEngine = (
  daemonEnabled: boolean,
  project: Pick<Project, "services">,
  mode: SessionMode,
): boolean => daemonEnabled && project.services.enabled && mode !== "triage";

/** What a session of this task and mode occupies: two slots when it gets an engine, one otherwise. */
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
export function planSessionStarts(
  model: ReadModel,
  maxConcurrentSessions: number,
  servicesEnabled: boolean,
): SessionStart[] {
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
  for (const task of candidates) {
    if (capacity <= 0) {
      break;
    }
    const start = candidateOf(task);
    if (start === null) {
      continue;
    }
    // A task that needs an engine waits for a free slot pair instead of blocking cheaper work behind it.
    const cost = costOf(model, start, servicesEnabled);
    if (cost > capacity) {
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
    capacity -= cost;
  }
  return starts;
}
