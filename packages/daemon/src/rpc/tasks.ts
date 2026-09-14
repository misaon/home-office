import { assignTask, clearFinishedTasks, createTask, removeTask, transitionTask } from "@ho/core";
import { HUMAN_ACTOR } from "@ho/protocol";
import { guarded } from "./guarded.ts";
import { os } from "./implement.ts";

const base = os.use(guarded);

/** Everything the board can ask of a task, in its own module because the router has a size limit. */
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
  clear: base.tasks.clear.handler(async ({ input, context }) => ({
    removed: (
      await context.office.execute(HUMAN_ACTOR, (m, ctx) =>
        clearFinishedTasks(m, input.projectId, ctx),
      )
    ).length,
  })),
};
