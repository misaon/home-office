import { assignTask, clearFinishedTasks, createTask, removeTask, transitionTask } from "@ho/core";
import { HUMAN_ACTOR, notFound } from "@ho/protocol";
import { DomainFailureError } from "../domain-failure.ts";
import { publishTask } from "../publish.ts";
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
  get: base.tasks.get.handler(({ input, context }) => {
    const task = context.office.model.tasks.get(input.id);
    if (task === undefined) {
      throw new DomainFailureError(notFound("task", input.id));
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
  remove: base.tasks.remove.handler(async ({ input, context }) => {
    await context.sessions.stopTask(input.id);
    return {
      id: await context.office.execute(HUMAN_ACTOR, (m, ctx) => removeTask(m, input.id, ctx)),
    };
  }),
  publish: base.tasks.publish.handler(({ input, context }) =>
    publishTask(context.office, context.home, input.id),
  ),
  clear: base.tasks.clear.handler(async ({ input, context }) => {
    const cleared = await context.office.execute(HUMAN_ACTOR, (m, ctx) =>
      clearFinishedTasks(m, input.projectId, ctx),
    );
    return { removed: cleared.length };
  }),
};
