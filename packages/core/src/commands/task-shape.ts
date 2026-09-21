import { raiseShape, type Task, type TaskId, type TaskShape } from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, ok } from "../result.ts";
import { withTask } from "./shared.ts";
import { readTask } from "./tasks.ts";

export function raiseTaskShape(
  model: ReadModel,
  taskId: TaskId,
  input: { floor: TaskShape; reason: string },
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) => {
    const to = raiseShape(task.shape, input.floor);
    return ok({
      events:
        to === task.shape
          ? []
          : [
              {
                type: "task.shape_raised",
                actor: ctx.actor,
                payload: { taskId: task.id, from: task.shape, to, reason: input.reason },
              },
            ],
      read: readTask(task.id),
    });
  });
}
