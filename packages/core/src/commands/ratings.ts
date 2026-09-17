import type { Task, TaskRateInput } from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, ok } from "../result.ts";
import { withTask } from "./shared.ts";
import { readTask } from "./tasks.ts";

export function rateTask(
  model: ReadModel,
  input: TaskRateInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, input.id, (task) =>
    ok({
      events: [
        {
          type: "task.rated",
          actor: ctx.actor,
          payload: {
            taskId: task.id,
            rating: { verdict: input.verdict, note: input.note, at: ctx.now },
          },
        },
      ],
      read: readTask(task.id),
    }),
  );
}
