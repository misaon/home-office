import type { Agent, AgentId, Task } from "@ho/protocol";
import { sessionsOfTask } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";

export type SpentBudget = { turns: number; costUsd: number; costKnown: boolean; round: number };

export type RemainingBudget = { turns: number; usd: number | null };

export const spentOnTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  task: Pick<Task, "id" | "reviewRounds">,
  agentId: AgentId,
): SpentBudget => {
  const spent: SpentBudget = { turns: 0, costUsd: 0, costKnown: false, round: task.reviewRounds };
  for (const session of sessionsOfTask(model, task.id)) {
    if (session.agentId !== agentId || session.round !== task.reviewRounds) {
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

const roundName = (round: number): string =>
  round === 0 ? "this task's first round" : `review round ${String(round)} of this task`;

export const budgetExhausted = (agent: Agent, spent: SpentBudget): string | null => {
  if (spent.turns >= agent.budgets.maxTurnsPerTask) {
    return `${agent.name} has spent the ${String(agent.budgets.maxTurnsPerTask)} turns allowed for ${roundName(spent.round)} (${String(spent.turns)} used)`;
  }
  const { maxUsdPerTask } = agent.budgets;
  if (maxUsdPerTask !== undefined && spent.costKnown && spent.costUsd >= maxUsdPerTask) {
    return `${agent.name} has spent the $${maxUsdPerTask.toFixed(2)} allowed for ${roundName(spent.round)} ($${spent.costUsd.toFixed(2)} reported)`;
  }
  return null;
};
