import type { ReadModel } from "@ho/core";
import { type Agent, type ReviewerScore, reviewVerdictOf, type Task } from "@ho/protocol";

const anyone = (model: ReadModel, agentId: Agent["id"]): Agent | undefined =>
  model.agents.get(agentId) ?? model.formerAgents.get(agentId);

export const scoreReviewers = (
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
      const reviewer = anyone(model, entry.author.agentId);
      if (verdict === null || reviewer === undefined) {
        continue;
      }
      const score = scores.get(reviewer.id) ?? {
        agentId: reviewer.id,
        name: reviewer.name,
        role: reviewer.role,
        departed: !model.agents.has(reviewer.id),
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
