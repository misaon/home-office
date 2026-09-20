import { type ReadModel, sessionsOfTask, verifyAttempts } from "@ho/core";
import {
  addUsage,
  type Agent,
  type AgentScore,
  type EvalAttention,
  type EvalFlag,
  type EvalInput,
  type EvalScorecard,
  type RoleScore,
  type RunConfiguration,
  type Session,
  type Task,
  ZERO_USAGE,
} from "@ho/protocol";
import { scoreReviewers } from "./evals-reviewers.ts";

const ATTENTION_LIMIT = 20;
const REWORK_ROUNDS = 2;
const RETRY_SESSIONS = 3;
const MINUTE_MS = 60_000;

type Counts = EvalScorecard["office"];

const zero = (): Counts => ({
  finished: 0,
  blocked: 0,
  failed: 0,
  firstPass: 0,
  reviewRounds: 0,
  verifyFailures: 0,
  planning: 0,
  sessions: 0,
  minutes: 0,
  ratedGood: 0,
  ratedBad: 0,
  usage: ZERO_USAGE,
  costUsd: 0,
  costKnown: 0,
});

const anyone = (model: ReadModel, agentId: Agent["id"]): Agent | undefined =>
  model.agents.get(agentId) ?? model.formerAgents.get(agentId);

const minutesOf = (session: Session): number =>
  session.endedAt === undefined
    ? 0
    : Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) /
      MINUTE_MS;

const countTask = (into: Counts, task: Task): void => {
  if (task.kind !== "work") {
    if (task.status === "done") {
      into.planning += 1;
    }
    return;
  }
  const failedChecks = verifyAttempts(task);
  into.verifyFailures += failedChecks;
  if (task.status === "done") {
    into.finished += 1;
    into.reviewRounds += task.reviewRounds;
    if (task.reviewRounds === 0 && failedChecks === 0) {
      into.firstPass += 1;
    }
  }
  if (task.status === "blocked") {
    into.blocked += 1;
  }
  if (task.status === "failed") {
    into.failed += 1;
  }
  if (task.rating?.verdict === "good") {
    into.ratedGood += 1;
  }
  if (task.rating?.verdict === "bad") {
    into.ratedBad += 1;
  }
};

const countSession = (into: Counts, session: Session): void => {
  into.sessions += 1;
  into.minutes += minutesOf(session);
  into.usage = addUsage(into.usage, session.usage);
  if (session.costUsd !== undefined) {
    into.costUsd += session.costUsd;
    into.costKnown += 1;
  }
};

const addCounts = (into: Counts, from: Counts): void => {
  into.finished += from.finished;
  into.blocked += from.blocked;
  into.failed += from.failed;
  into.firstPass += from.firstPass;
  into.reviewRounds += from.reviewRounds;
  into.verifyFailures += from.verifyFailures;
  into.planning += from.planning;
  into.sessions += from.sessions;
  into.minutes += from.minutes;
  into.ratedGood += from.ratedGood;
  into.ratedBad += from.ratedBad;
  into.costUsd += from.costUsd;
  into.costKnown += from.costKnown;
  into.usage = addUsage(into.usage, from.usage);
};

const workSessionsOf = (model: ReadModel, task: Task): Session[] =>
  sessionsOfTask(model, task.id).filter((session) => session.mode === "work");

const flagOf = (task: Task, sessions: number): { flag: EvalFlag; detail: string } | null => {
  if (task.status === "failed") {
    return { flag: "failed", detail: "the session could not finish" };
  }
  if (task.rating?.verdict === "bad") {
    return { flag: "rated_bad", detail: task.rating.note === "" ? "rated bad" : task.rating.note };
  }
  if (task.status === "blocked") {
    return { flag: "blocked", detail: "waiting on a decision or out of review rounds" };
  }
  if (task.reviewRounds >= REWORK_ROUNDS) {
    return { flag: "rework", detail: `sent back ${String(task.reviewRounds)} times` };
  }
  if (sessions >= RETRY_SESSIONS) {
    return { flag: "retried", detail: `took ${String(sessions)} sessions` };
  }
  return null;
};

const SEVERITY: Readonly<Record<EvalFlag, number>> = {
  failed: 0,
  rated_bad: 1,
  blocked: 2,
  rework: 3,
  retried: 4,
};

const runOf = (agent: Agent, session: Session): { model: string; effort: string } => {
  const { runtime } = session;
  return runtime === undefined
    ? { model: agent.model, effort: agent.effort }
    : {
        model: runtime.confirmedModel ?? runtime.model,
        effort: runtime.confirmedEffort ?? runtime.effort,
      };
};

const runsOf = (agent: Agent, sessions: readonly Session[]): RunConfiguration[] => {
  const seen = new Map<string, RunConfiguration>();
  for (const session of sessions) {
    const run = runOf(agent, session);
    const key = `${run.model}/${run.effort}`;
    const known = seen.get(key);
    seen.set(
      key,
      known === undefined ? { ...run, sessions: 1 } : { ...known, sessions: known.sessions + 1 },
    );
  }
  return [...seen.values()].toSorted((a, b) => b.sessions - a.sessions);
};

export function scorecard(model: ReadModel, now: number, input: EvalInput): EvalScorecard {
  const since =
    input.sinceHours === undefined
      ? null
      : new Date(now - input.sinceHours * 3_600_000).toISOString();
  const inWindow = (at: string): boolean => since === null || at >= since;
  const tasks = [...model.tasks.values()].filter(
    (task) =>
      inWindow(task.updatedAt) &&
      (input.projectId === undefined || task.projectId === input.projectId),
  );
  const office = zero();
  const perAgent = new Map<Agent["id"], Counts>();
  const sessionsByAgent = new Map<Agent["id"], Session[]>();
  const attention: (EvalAttention & { at: string; severity: number })[] = [];

  for (const task of tasks) {
    countTask(office, task);
    if (task.assigneeId !== undefined) {
      const counts = perAgent.get(task.assigneeId) ?? zero();
      countTask(counts, task);
      perAgent.set(task.assigneeId, counts);
    }
    const sessions = workSessionsOf(model, task).length;
    const flagged = flagOf(task, sessions);
    if (flagged !== null) {
      const assignee = task.assigneeId === undefined ? null : anyone(model, task.assigneeId);
      attention.push({
        taskId: task.id,
        title: task.title,
        flag: flagged.flag,
        agent: assignee?.name ?? null,
        reviewRounds: task.reviewRounds,
        sessions,
        detail: flagged.detail,
        at: task.updatedAt,
        severity: SEVERITY[flagged.flag],
      });
    }
  }

  for (const session of model.sessions.values()) {
    if (!inWindow(session.startedAt)) {
      continue;
    }
    const task = model.tasks.get(session.taskId);
    if (input.projectId !== undefined && task?.projectId !== input.projectId) {
      continue;
    }
    countSession(office, session);
    const counts = perAgent.get(session.agentId) ?? zero();
    countSession(counts, session);
    perAgent.set(session.agentId, counts);
    sessionsByAgent.set(session.agentId, [
      ...(sessionsByAgent.get(session.agentId) ?? []),
      session,
    ]);
  }

  const agents: AgentScore[] = [];
  for (const [agentId, counts] of perAgent) {
    const agent = anyone(model, agentId);
    if (agent === undefined) {
      continue;
    }
    agents.push({
      ...counts,
      agentId,
      name: agent.name,
      role: agent.role,
      model: agent.model,
      effort: agent.effort,
      runs: runsOf(agent, sessionsByAgent.get(agentId) ?? []),
      departed: !model.agents.has(agentId),
    });
  }

  const byRole = new Map<AgentScore["role"], RoleScore>();
  for (const score of agents) {
    const carried = byRole.get(score.role) ?? { ...zero(), role: score.role, people: 0 };
    addCounts(carried, score);
    if (!score.departed) {
      carried.people += 1;
    }
    byRole.set(score.role, carried);
  }

  return {
    since,
    until: new Date(now).toISOString(),
    office,
    agents: agents.toSorted((a, b) => b.finished - a.finished || a.name.localeCompare(b.name)),
    roles: [...byRole.values()].toSorted(
      (a, b) => b.costUsd - a.costUsd || b.finished - a.finished,
    ),
    reviewers: [...scoreReviewers(model, tasks).values()].toSorted(
      (a, b) => b.reviewed - a.reviewed || a.name.localeCompare(b.name),
    ),
    attention: attention
      .toSorted((a, b) => a.severity - b.severity || b.at.localeCompare(a.at))
      .slice(0, ATTENTION_LIMIT)
      .map(({ at: _at, severity: _severity, ...item }) => item),
  };
}
