import {
  conflict,
  type DomainError,
  notFound,
  type ProjectId,
  type ReviewPlan,
  ROLE_TITLE,
  type Task,
  type TaskId,
} from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok, type Result } from "../result.ts";
import { reviewPlanOf, type ReviewRoster } from "./review-plan.ts";

export const checkDependencies = (
  model: Pick<ReadModel, "tasks">,
  projectId: ProjectId,
  dependsOn: readonly TaskId[],
): Result<TaskId[], DomainError> => {
  const unique = [...new Set(dependsOn)];
  for (const id of unique) {
    const dependency = model.tasks.get(id);
    if (dependency === undefined) {
      return err(notFound("task", id));
    }
    if (dependency.projectId !== projectId) {
      return err(conflict(`task "${dependency.title}" belongs to another floor`));
    }
    if (dependency.kind !== "work") {
      return err(
        conflict(`"${dependency.title}" is a ${dependency.kind} task; only work can be built on`),
      );
    }
    if (dependency.status === "cancelled") {
      return err(conflict(`"${dependency.title}" was cancelled; nothing can build on it`));
    }
  }
  return ok(unique);
};

export const checkReviewers = (
  model: ReviewRoster,
  task: { projectId: ProjectId; reviews: ReviewPlan; assigneeId?: Task["assigneeId"] },
): Result<null, DomainError> => {
  const chosen = reviewPlanOf(model, task).missing.filter((stage) => stage !== "head");
  if (chosen.length === 0) {
    return ok(null);
  }
  const roles = chosen.map((stage) => ROLE_TITLE[stage]).join(" and ");
  return err(
    conflict(
      `this floor has no ${roles} to review the task; hire one first, or set ${chosen.join(" and ")} to false and say why`,
    ),
  );
};
