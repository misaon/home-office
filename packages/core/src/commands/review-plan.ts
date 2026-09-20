import {
  type Agent,
  type AgentId,
  type ProjectId,
  REVIEW_STAGES,
  type ReviewStage,
  ROLE_TITLE,
  type Task,
} from "@ho/protocol";
import { membersOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";

export type ReviewPlanState = { chain: Agent[]; missing: ReviewStage[] };

type Reviewed = Pick<Task, "projectId" | "reviews"> & { assigneeId?: Task["assigneeId"] };

export type ReviewRoster = {
  agents: ReadonlyMap<AgentId, Agent>;
  agentsByProject: ReadonlyMap<ProjectId, ReadonlySet<AgentId>>;
};

export const reviewPlanOf = (model: ReviewRoster, task: Reviewed): ReviewPlanState => {
  const members = membersOf(model, task.projectId);
  const chain: Agent[] = [];
  const missing: ReviewStage[] = [];
  for (const stage of REVIEW_STAGES) {
    if (!task.reviews[stage]) {
      continue;
    }
    const reviewer = members.find((agent) => agent.role === stage && agent.id !== task.assigneeId);
    if (reviewer === undefined) {
      missing.push(stage);
    } else {
      chain.push(reviewer);
    }
  }
  return { chain, missing };
};

export const reviewChain = (model: ReadModel, task: Task): Agent[] =>
  reviewPlanOf(model, task).chain;

export const missingReviewReason = (missing: readonly ReviewStage[]): string =>
  `review by ${missing.map((stage) => ROLE_TITLE[stage]).join(" and ")} is required, but nobody on this floor holds that role apart from the author; hire one or waive the review`;
