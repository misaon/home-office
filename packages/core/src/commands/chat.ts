import type { Author, ChatMessage, ChatSendInput, NewEvent, Task } from "@ho/protocol";
import { notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import type { CommandContext, CommandResult } from "./context.ts";

const TITLE_MAX = 200;

/** The first line of a brief makes a decent title until the boss rewrites it. */
export const titleFromText = (text: string): string => {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? text;
  const trimmed = firstLine.trim();
  return trimmed.length <= TITLE_MAX ? trimmed : `${trimmed.slice(0, TITLE_MAX - 1)}…`;
};

const authorOf = (ctx: CommandContext): Author =>
  ctx.actor.kind === "agent" ? { kind: "agent", agentId: ctx.actor.agentId } : { kind: "human" };

export function postChatMessage(
  model: ReadModel,
  input: ChatSendInput,
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  if (input.projectId !== undefined && !model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  const author = authorOf(ctx);
  const messageId = ctx.ids.chatMessage();
  const events: NewEvent[] = [];
  let task: Task | null = null;
  if (input.projectId !== undefined) {
    task = {
      id: ctx.ids.task(),
      projectId: input.projectId,
      title: titleFromText(input.text),
      brief: input.text,
      status: "inbox",
      source: { kind: "chat", messageId },
      artifacts: {},
      priority: "normal",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
  }
  const message: ChatMessage = {
    id: messageId,
    author,
    text: input.text,
    ...(task === null ? {} : { taskId: task.id }),
    at: ctx.now,
  };
  events.push({ type: "chat.message_posted", actor: ctx.actor, payload: { message, author } });
  if (task !== null) {
    events.push({ type: "task.created", actor: ctx.actor, payload: { task } });
  }
  return ok({ events, value: { message, task } });
}
