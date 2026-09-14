import type { ReadModel } from "@ho/core";
import { addUsage, type Usage, type UsageSummary, ZERO_USAGE } from "@ho/protocol";

type Bucket = UsageSummary["byAgent"][number];

const bump = (buckets: Map<string, Bucket>, key: string, label: string, usage: Usage): void => {
  const current = buckets.get(key) ?? { key, label, usage: ZERO_USAGE, sessions: 0 };
  buckets.set(key, {
    ...current,
    usage: addUsage(current.usage, usage),
    sessions: current.sessions + 1,
  });
};

const sorted = (buckets: Map<string, Bucket>): Bucket[] =>
  [...buckets.values()].toSorted(
    (a, b) =>
      b.usage.inputTokens + b.usage.outputTokens - (a.usage.inputTokens + a.usage.outputTokens),
  );

/** Token usage from the session projection, grouped for the Usage panel and `ho usage`. */
export function usageSummary(
  model: ReadModel,
  now: number,
  sinceHours: number | undefined,
): UsageSummary {
  const since =
    sinceHours === undefined ? null : new Date(now - sinceHours * 3_600_000).toISOString();
  const sessions = [...model.sessions.values()].filter(
    (s) => since === null || s.startedAt >= since,
  );
  const byAgent = new Map<string, Bucket>();
  const byProject = new Map<string, Bucket>();
  const byDay = new Map<string, Bucket>();
  let totals = ZERO_USAGE;
  for (const session of sessions) {
    totals = addUsage(totals, session.usage);
    const agent = model.agents.get(session.agentId);
    bump(byAgent, session.agentId, agent?.name ?? session.agentId.slice(-8), session.usage);
    const task = model.tasks.get(session.taskId);
    const project = task === undefined ? undefined : model.projects.get(task.projectId);
    bump(byProject, task?.projectId ?? "unknown", project?.name ?? "unknown", session.usage);
    const day = session.startedAt.slice(0, 10);
    bump(byDay, day, day, session.usage);
  }
  return {
    since,
    totals,
    sessions: sessions.length,
    rateLimitIncidents:
      since === null ? model.rateLimitsSeen : model.rateLimits.filter((at) => at >= since).length,
    byAgent: sorted(byAgent),
    byProject: sorted(byProject),
    byDay: [...byDay.values()].toSorted((a, b) => a.key.localeCompare(b.key)),
  };
}
