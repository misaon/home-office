import {
  assignTask,
  clearFinishedTasks,
  createTask,
  patchTaskArtifacts,
  removeTask,
  transitionTask,
} from "@ho/core";
import { HUMAN_ACTOR } from "@ho/protocol";
import { publishTaskBranch } from "../publish.ts";
import { guarded } from "./guarded.ts";
import { os } from "./implement.ts";

const base = os.use(guarded);

export const taskRoutes = {
  list: base.tasks.list.handler(({ input, context }) =>
    [...context.office.model.tasks.values()].filter(
      (task) =>
        (input.projectId === undefined || task.projectId === input.projectId) &&
        (input.status === undefined || input.status.includes(task.status)),
    ),
  ),
  get: base.tasks.get.handler(({ input, context, errors }) => {
    const task = context.office.model.tasks.get(input.id);
    if (task === undefined) {
      throw errors.NOT_FOUND({ data: { entity: "task", id: input.id } });
    }
    return task;
  }),
  create: base.tasks.create.handler(({ input, context }) =>
    context.office.execute(HUMAN_ACTOR, (m, ctx) => createTask(m, input, ctx)),
  ),
  assign: base.tasks.assign.handler(({ input, context }) =>
    context.office.execute(HUMAN_ACTOR, (m, ctx) => assignTask(m, input, ctx)),
  ),
  transition: base.tasks.transition.handler(({ input, context }) =>
    context.office.execute(HUMAN_ACTOR, (m, ctx) => transitionTask(m, input, ctx)),
  ),
  remove: base.tasks.remove.handler(async ({ input, context }) => ({
    id: await context.office.execute(HUMAN_ACTOR, (m, ctx) => removeTask(m, input.id, ctx)),
  })),
  publish: base.tasks.publish.handler(async ({ input, context, errors }) => {
    const task = context.office.model.tasks.get(input.id);
    if (task === undefined) {
      throw errors.NOT_FOUND({ data: { entity: "task", id: input.id } });
    }
    const project = context.office.model.projects.get(task.projectId);
    if (project === undefined) {
      throw errors.NOT_FOUND({ data: { entity: "project", id: task.projectId } });
    }
    const { branch } = task.artifacts;
    if (branch === undefined) {
      throw errors.CONFLICT({
        data: { reason: "this task has no branch yet; nothing has been written for it" },
      });
    }
    const published = await publishTaskBranch(
      context.home,
      project,
      task,
      branch,
      task.artifacts.report ?? task.brief,
    );
    if (published.prUrl !== null) {
      await context.office.execute(HUMAN_ACTOR, (m, ctx) =>
        patchTaskArtifacts(m, task.id, { prUrl: published.prUrl ?? undefined }, ctx),
      );
    }
    return published;
  }),
  clear: base.tasks.clear.handler(async ({ input, context }) => {
    const cleared = await context.office.execute(HUMAN_ACTOR, (m, ctx) =>
      clearFinishedTasks(m, input.projectId, ctx),
    );
    return { removed: cleared.length };
  }),
};
