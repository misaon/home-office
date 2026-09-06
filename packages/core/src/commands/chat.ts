import type { ChatMessage, ChatSendInput, NewEvent, Task } from "@ho/protocol";
import { notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { triageMessage } from "./boss.ts";
import { answerQuestion } from "./handoff.ts";
import type { CommandContext, CommandResult } from "./context.ts";

const TITLE_MAX = 200;

/** The first line of a brief makes a decent title until the boss rewrites it. */
export const titleFromText = (text: string): string => {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? text;
  const trimmed = firstLine.trim();
  return trimmed.length <= TITLE_MAX ? trimmed : `${trimmed.slice(0, TITLE_MAX - 1)}…`;
};

/**
 * A human message: answers a task's question when `taskId` is given, opens an inbox task when `projectId` is
 * given, otherwise lands on the boss's desk as a triage task (or stays a plain message without a boss).
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
    return triageMessage(model, input.text, ctx);
  }
  if (!model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  const messageId = ctx.ids.chatMessage();
  const task: Task = {
    id: ctx.ids.task(),
    projectId: input.projectId,
    kind: "work",
    title: titleFromText(input.text),
    brief: input.text,
    status: "inbox",
    reviewRounds: 0,
    notes: [],
    source: { kind: "chat", messageId },
    artifacts: {},
    priority: "normal",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const message: ChatMessage = {
    id: messageId,
    author: { kind: "human" },
    text: input.text,
    taskId: task.id,
    at: ctx.now,
  };
  const events: NewEvent[] = [
    { type: "chat.message_posted", actor: ctx.actor, payload: { message, author: message.author } },
    { type: "task.created", actor: ctx.actor, payload: { task } },
  ];
  return ok({ events, value: { message, task } });
}
