import {
  type AgentId,
  type Attachment,
  type ChatMessage,
  conflict,
  type HoHandoffInput,
  notFound,
  NOTE_MAX,
  type Task,
  type TaskId,
  type TaskStatus,
} from "@ho/protocol";
import { findAgentByRef } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { chatEvent, handoffEvent, note, noteEvent, requireTask, statusChange } from "./shared.ts";
import { canTransition, readTask } from "./tasks.ts";

/** Passes the task to a colleague: the current session ends, the target's session starts with the brief. */
export function handoffTask(
  model: ReadModel,
  taskId: TaskId,
  fromAgentId: AgentId,
  input: HoHandoffInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  const target = findAgentByRef(model, input.toAgent, task.projectId);
  if (target === undefined) {
    return err(notFound("agent", `${input.toAgent} (on this floor)`));
  }
  if (target.id === fromAgentId) {
    return err(conflict("cannot hand a task to yourself"));
  }
  if (!canTransition(task.status, "assigned")) {
    return err(conflict(`task is ${task.status}; it cannot be handed off now`));
  }
  const handoffNote = note(
    ctx,
    "handoff",
    `from ${model.agents.get(fromAgentId)?.name ?? fromAgentId}: ${input.brief}`,
  );
  return ok({
    events: [
      handoffEvent(ctx, task.id, fromAgentId, target.id, input.brief),
      noteEvent(ctx, task, handoffNote),
      { type: "task.assigned", actor: ctx.actor, payload: { taskId: task.id, agentId: target.id } },
      statusChange(ctx, task, "assigned", `handed off to ${target.name}`),
    ],
    read: readTask(task.id),
  });
}

const readTaskAndMessage =
  (taskId: TaskId, message: ChatMessage) =>
  (model: ReadModel): { task: Task; message: ChatMessage } => ({
    task: readTask(taskId)(model),
    message,
  });

/** Pauses the task with a question for the human; the answer (chat.send with taskId) resumes it. */
export function askHuman(
  model: ReadModel,
  taskId: TaskId,
  question: string,
  ctx: CommandContext,
): CommandResult<{ task: Task; message: ChatMessage }> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (ctx.actor.kind !== "agent") {
    return err(conflict("only agents ask the human through this command"));
  }
  if (!canTransition(task.status, "blocked")) {
    return err(conflict(`task is ${task.status}; it cannot wait for an answer now`));
  }
  const message: ChatMessage = {
    id: ctx.ids.chatMessage(),
    projectId: task.projectId,
    author: { kind: "agent", agentId: ctx.actor.agentId },
    text: question,
    attachments: [],
    taskId: task.id,
    at: ctx.now,
  };
  return ok({
    events: [
      noteEvent(ctx, task, note(ctx, "question", question)),
      chatEvent(ctx, message),
      statusChange(ctx, task, "blocked", `question: ${question.slice(0, 1900)}`),
    ],
    read: readTaskAndMessage(task.id, message),
  });
}

/** The human answers; the task goes back to its assignee (or the inbox) and the paused session resumes. */
export function answerQuestion(
  model: ReadModel,
  taskId: TaskId,
  text: string,
  attachments: readonly Attachment[],
  ctx: CommandContext,
): CommandResult<{ task: Task; message: ChatMessage }> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  const message: ChatMessage = {
    id: ctx.ids.chatMessage(),
    projectId: task.projectId,
    author: { kind: "human" },
    text,
    attachments: [...attachments],
    taskId: task.id,
    at: ctx.now,
  };
  const events = [
    chatEvent(ctx, message),
    noteEvent(ctx, task, note(ctx, "answer", text.slice(0, NOTE_MAX))),
  ];
  if (task.status === "blocked") {
    const to: TaskStatus = task.assigneeId === undefined ? "planned" : "assigned";
    events.push(statusChange(ctx, task, to, "answered"));
  }
  return ok({ events, read: readTaskAndMessage(task.id, message) });
}
