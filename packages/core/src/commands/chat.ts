import type { ChatMessage, ChatSendInput, Task } from "@ho/protocol";
import { conflict } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { triageMessage } from "./boss.ts";
import { answerQuestion } from "./handoff.ts";
import type { CommandContext, CommandResult } from "./context.ts";

/**
 * A human message: with `taskId` it answers a question an agent asked and resumes the task; with `projectId`
 * it lands on that floor's boss as a triage task. The human only ever talks to bosses.
 */
export function postChatMessage(
  model: ReadModel,
  input: ChatSendInput,
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  if (input.taskId !== undefined) {
    const answered = answerQuestion(model, input.taskId, input.text, ctx);
    return answered.ok
      ? ok({
          events: answered.value.events,
          value: { message: answered.value.value.message, task: answered.value.value.task },
        })
      : answered;
  }
  if (input.projectId === undefined) {
    return err(
      conflict("a chat message needs the floor (projectId) or the task it answers (taskId)"),
    );
  }
  return triageMessage(model, input.projectId, input.text, ctx);
}
