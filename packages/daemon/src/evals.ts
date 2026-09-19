import type { ReadModel } from "@ho/core";
import {
  addUsage,
  type Agent,
  type AgentScore,
  type EvalAttention,
  type EvalFlag,
  type EvalInput,
  type EvalScorecard,
  type ReviewerScore,
  reviewVerdictOf,
  type Session,
  type Task,
  ZERO_USAGE,
} from "@ho/protocol";

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
  sessions: 0,
  minutes: 0,
  ratedGood: 0,
  ratedBad: 0,
  usage: ZERO_USAGE,
});

const minutesOf = (session: Session): number =>
  session.endedAt === undefined
    ? 0
    : Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) /
      MINUTE_MS;

const countTask = (into: Counts, task: Task): void => {
  if (task.status === "done") {
    into.finished += 1;
    into.reviewRounds += task.reviewRounds;
    if (task.reviewRounds === 0) {
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
};

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

const scoreReviewers = (
  model: ReadModel,
  tasks: readonly Task[],
): Map<Agent["id"], ReviewerScore> => {
  const scores = new Map<Agent["id"], ReviewerScore>();
  for (const task of tasks) {
    const ratedBad = task.rating?.verdict === "bad";
    for (const entry of task.notes) {
      if (entry.kind !== "review" || entry.author.kind !== "agent") {
        continue;
      }
      const verdict = reviewVerdictOf(entry.text);
      const reviewer = model.agents.get(entry.author.agentId);
      if (verdict === null || reviewer === undefined) {
        continue;
      }
      const score = scores.get(reviewer.id) ?? {
        agentId: reviewer.id,
        name: reviewer.name,
        role: reviewer.role,
        reviewed: 0,
        approved: 0,
        requestedChanges: 0,
        escapes: 0,
      };
      score.reviewed += 1;
      if (verdict === "approve") {
        score.approved += 1;
        if (ratedBad) {
          score.escapes += 1;
        }
      } else {
        score.requestedChanges += 1;
      }
      scores.set(reviewer.id, score);
    }
  }
  return scores;
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
  const attention: (EvalAttention & { at: string; severity: number })[] = [];

  for (const task of tasks) {
    countTask(office, task);
    if (task.assigneeId !== undefined) {
      const counts = perAgent.get(task.assigneeId) ?? zero();
      countTask(counts, task);
      perAgent.set(task.assigneeId, counts);
    }
    const sessions = model.sessionsByTask.get(task.id)?.size ?? 0;
    const flagged = flagOf(task, sessions);
    if (flagged !== null) {
      const assignee = task.assigneeId === undefined ? null : model.agents.get(task.assigneeId);
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
  }

  const agents: AgentScore[] = [];
  for (const [agentId, counts] of perAgent) {
    const agent = model.agents.get(agentId);
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
    });
  }

  return {
    since,
    until: new Date(now).toISOString(),
    office,
    agents: agents.toSorted((a, b) => b.finished - a.finished || a.name.localeCompare(b.name)),
    reviewers: [...scoreReviewers(model, tasks).values()].toSorted(
      (a, b) => b.reviewed - a.reviewed || a.name.localeCompare(b.name),
    ),
    attention: attention
      .toSorted((a, b) => a.severity - b.severity || b.at.localeCompare(a.at))
      .slice(0, ATTENTION_LIMIT)
      .map(({ at: _at, severity: _severity, ...item }) => item),
  };
}
