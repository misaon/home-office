import {
  type AgentId,
  type ChatMessage,
  compact,
  type DomainError,
  type NewEvent,
  notFound,
  type Task,
  type TaskId,
  type TaskNote,
  type TaskStatus,
} from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, err, ok, type Result } from "../result.ts";

export const TITLE_MAX = 200;

/** The first line of a brief makes a decent title until the boss rewrites it. */
export const titleFromText = (text: string): string => {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? text;
  const trimmed = firstLine.trim();
  return trimmed.length <= TITLE_MAX ? trimmed : `${trimmed.slice(0, TITLE_MAX - 1)}…`;
};

export const note = (ctx: CommandContext, kind: TaskNote["kind"], text: string): TaskNote => ({
  at: ctx.now,
  author: ctx.actor,
  kind,
  text,
});

export const noteEvent = (ctx: CommandContext, task: Task, n: TaskNote): NewEvent => ({
  type: "task.note_added",
  actor: ctx.actor,
  payload: { taskId: task.id, note: n },
});

export const statusChange = (
  ctx: CommandContext,
  task: Task,
  to: TaskStatus,
  reason?: string,
): NewEvent => ({
  type: "task.status_changed",
  actor: ctx.actor,
  payload: { taskId: task.id, from: task.status, to, ...compact({ reason }) },
});

/** The office animates this: `from` walks the envelope over to `to` before the daemon acts on it. */
export const handoffEvent = (
  ctx: CommandContext,
  taskId: TaskId,
  fromAgentId: AgentId,
  toAgentId: AgentId,
  brief: string,
): NewEvent => ({
  type: "handoff.requested",
  actor: ctx.actor,
  payload: { taskId, fromAgentId, toAgentId, brief },
});

export const chatEvent = (ctx: CommandContext, message: ChatMessage): NewEvent => ({
  type: "chat.message_posted",
  actor: ctx.actor,
  payload: { message },
});

export const requireTask = (model: ReadModel, taskId: TaskId): Result<Task, DomainError> => {
  const task = model.tasks.get(taskId);
  return task === undefined ? err(notFound("task", taskId)) : ok(task);
};
