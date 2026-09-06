import type { EventStore } from "@ho/core";
import type { Usage, UsageSummary } from "@ho/protocol";
import type { Office } from "./office.ts";

const ZERO: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
};
const add = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  turns: a.turns + b.turns,
});

type Bucket = { key: string; label: string; usage: Usage; sessions: number };
const bump = (buckets: Map<string, Bucket>, key: string, label: string, usage: Usage): void => {
  const current = buckets.get(key) ?? { key, label, usage: ZERO, sessions: 0 };
  buckets.set(key, {
    ...current,
    usage: add(current.usage, usage),
    sessions: current.sessions + 1,
  });
};
const sorted = (buckets: Map<string, Bucket>): Bucket[] =>
  [...buckets.values()].toSorted(
    (a, b) =>
      b.usage.inputTokens + b.usage.outputTokens - (a.usage.inputTokens + a.usage.outputTokens),
  );

/** Token usage from the session projection, grouped for the Usage panel and `ho usage`. */
export async function usageSummary(
  office: Office,
  store: EventStore,
  sinceHours: number | undefined,
): Promise<UsageSummary> {
  const now = office.clock.now().getTime();
  const since =
    sinceHours === undefined ? null : new Date(now - sinceHours * 3_600_000).toISOString();
  const sessions = [...office.model.sessions.values()].filter(
    (s) => since === null || s.startedAt >= since,
  );
  const byAgent = new Map<string, Bucket>();
  const byProject = new Map<string, Bucket>();
  const byDay = new Map<string, Bucket>();
  let totals = ZERO;
  for (const session of sessions) {
    totals = add(totals, session.usage);
    const agent = office.model.agents.get(session.agentId);
    bump(byAgent, session.agentId, agent?.name ?? session.agentId.slice(-8), session.usage);
    const task = office.model.tasks.get(session.taskId);
    const project = task === undefined ? undefined : office.model.projects.get(task.projectId);
    bump(byProject, task?.projectId ?? "unknown", project?.name ?? "unknown", session.usage);
    const day = session.startedAt.slice(0, 10);
    bump(byDay, day, day, session.usage);
  }
  let rateLimitIncidents = 0;
  for await (const event of store.read(-1, { types: ["session.state_changed"] })) {
    if (
      event.type === "session.state_changed" &&
      event.payload.reason?.startsWith("rate limited") === true &&
      (since === null || event.at >= since)
    ) {
      rateLimitIncidents += 1;
    }
  }
  return {
    since,
    totals,
    sessions: sessions.length,
    rateLimitIncidents,
    byAgent: sorted(byAgent),
    byProject: sorted(byProject),
    byDay: [...byDay.values()].toSorted((a, b) => a.key.localeCompare(b.key)),
  };
}
