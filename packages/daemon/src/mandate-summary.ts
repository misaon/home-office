import { type ReadModel, sessionsOfTask, tasksOfMandate } from "@ho/core";
import { addUsage, type Mandate, type Session, type Task, ZERO_USAGE } from "@ho/protocol";
import { timingOf } from "./task-timing.ts";

const wallMsOf = (session: Session, at: string): number =>
  Math.max(0, Date.parse(session.endedAt ?? at) - Date.parse(session.startedAt));

const sessionSummary = (
  model: ReadModel,
  task: Task,
  session: Session,
  at: string,
): Record<string, unknown> => ({
  sessionId: session.id,
  taskId: task.id,
  kind: task.kind,
  mode: session.mode,
  agent: model.agents.get(session.agentId)?.name ?? null,
  model: session.runtime?.confirmedModel ?? session.runtime?.model ?? null,
  effort: session.runtime?.confirmedEffort ?? session.runtime?.effort ?? null,
  state: session.state,
  wallMs: wallMsOf(session, at),
  apiMs: session.usage.apiMs ?? null,
  turns: session.usage.turns,
  tokens: {
    input: session.usage.inputTokens,
    output: session.usage.outputTokens,
    cacheRead: session.usage.cacheReadTokens,
    cacheWrite: session.usage.cacheWriteTokens,
    thinking: session.usage.thinkingTokens ?? null,
  },
  costUsd: session.costUsd ?? null,
  costBasis: session.costBasis ?? null,
});

export function requestSummary(
  model: ReadModel,
  mandate: Mandate,
  at: string,
): Record<string, unknown> {
  const tasks = tasksOfMandate(model, mandate);
  const pairs = tasks.flatMap((task) =>
    sessionsOfTask(model, task.id).map((session) => ({ task, session })),
  );
  const usage = pairs.reduce((sum, pair) => addUsage(sum, pair.session.usage), ZERO_USAGE);
  const costs = pairs.map((pair) => pair.session.costUsd).filter((cost) => cost !== undefined);
  const bases = new Set(pairs.map((pair) => pair.session.costBasis).filter((b) => b !== undefined));
  const root = model.tasks.get(mandate.rootTaskId);
  return {
    mandateId: mandate.id,
    title: mandate.title,
    status: mandate.status,
    round: mandate.round,
    tasks: tasks.length,
    sinceRequestMs: root === undefined ? null : timingOf(model, root, at).sinceRequestMs,
    sessions: pairs.map((pair) => sessionSummary(model, pair.task, pair.session, at)),
    totals: {
      sessions: pairs.length,
      wallMs: pairs.reduce((sum, pair) => sum + wallMsOf(pair.session, at), 0),
      apiMs: usage.apiMs ?? null,
      turns: usage.turns,
      tokens: {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: usage.cacheWriteTokens,
        thinking: usage.thinkingTokens ?? null,
      },
      costUsd: costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0),
      costBasis: bases.size === 0 ? null : [...bases].toSorted().join("+"),
    },
    artifacts: {
      branch: mandate.artifacts.branch ?? null,
      commit: mandate.artifacts.commit ?? null,
      prUrl: mandate.artifacts.prUrl ?? null,
    },
  };
}
