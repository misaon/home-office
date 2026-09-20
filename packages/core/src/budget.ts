import type { Agent, AgentId, TaskId } from "@ho/protocol";
import { sessionsOfTask } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";

export type SpentBudget = { turns: number; costUsd: number; costKnown: boolean };

export type RemainingBudget = { turns: number; usd: number | null };

export const spentOnTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  taskId: TaskId,
  agentId: AgentId,
): SpentBudget => {
  const spent: SpentBudget = { turns: 0, costUsd: 0, costKnown: false };
  for (const session of sessionsOfTask(model, taskId)) {
    if (session.agentId !== agentId) {
      continue;
    }
    spent.turns += session.usage.turns;
    if (session.costUsd !== undefined) {
      spent.costUsd += session.costUsd;
      spent.costKnown = true;
    }
  }
  return spent;
};

export const remainingBudget = (agent: Agent, spent: SpentBudget): RemainingBudget => ({
  turns: Math.max(0, agent.budgets.maxTurnsPerTask - spent.turns),
  usd:
    agent.budgets.maxUsdPerTask === undefined
      ? null
      : Math.max(0, agent.budgets.maxUsdPerTask - spent.costUsd),
});

export const budgetExhausted = (agent: Agent, spent: SpentBudget): string | null => {
  if (spent.turns >= agent.budgets.maxTurnsPerTask) {
    return `${agent.name} has spent the ${String(agent.budgets.maxTurnsPerTask)} turns this task allows (${String(spent.turns)} used across all sessions)`;
  }
  const { maxUsdPerTask } = agent.budgets;
  if (maxUsdPerTask !== undefined && spent.costKnown && spent.costUsd >= maxUsdPerTask) {
    return `${agent.name} has spent the $${maxUsdPerTask.toFixed(2)} this task allows ($${spent.costUsd.toFixed(2)} reported across all sessions)`;
  }
  return null;
};
