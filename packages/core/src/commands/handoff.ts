import type {
  AgentId,
  ChatMessage,
  HoHandoffInput,
  NewEvent,
  Task,
  TaskId,
  TaskStatus,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { canTransition } from "../tasks/transitions.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { findAgentByRef, note, noteEvent, requireTask, statusChange } from "./shared.ts";

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
  const target = findAgentByRef(model, input.toAgent);
  if (target === undefined) {
    return err(notFound("agent", input.toAgent));
  }
  if (target.id === fromAgentId) {
    return err(conflict("cannot hand a task to yourself"));
  }
  if (target.role !== "boss" && !target.projectIds.includes(task.projectId)) {
    return err(conflict(`${target.name} is not a member of this project`));
  }
  if (!canTransition(task.status, "assigned")) {
    return err(conflict(`task is ${task.status}; it cannot be handed off now`));
  }
  const handoffNote = note(
    ctx,
    "handoff",
    `from ${model.agents.get(fromAgentId)?.name ?? fromAgentId}: ${input.brief}`,
  );
  const events: NewEvent[] = [
    {
      type: "handoff.requested",
      actor: ctx.actor,
      payload: { taskId: task.id, fromAgentId, toAgentId: target.id, brief: input.brief },
    },
    noteEvent(ctx, task, handoffNote),
    { type: "task.assigned", actor: ctx.actor, payload: { taskId: task.id, agentId: target.id } },
    statusChange(ctx, task, "assigned", `handed off to ${target.name}`),
  ];
  return ok({
    events,
    value: {
      ...task,
      assigneeId: target.id,
      status: "assigned",
      notes: [...task.notes, handoffNote],
    },
  });
}

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
    author: { kind: "agent", agentId: ctx.actor.agentId },
    text: question,
    taskId: task.id,
    at: ctx.now,
  };
  const questionNote = note(ctx, "question", question);
  const events: NewEvent[] = [
    noteEvent(ctx, task, questionNote),
    { type: "chat.message_posted", actor: ctx.actor, payload: { message, author: message.author } },
    statusChange(ctx, task, "blocked", `question: ${question.slice(0, 1900)}`),
  ];
  return ok({
    events,
    value: { task: { ...task, status: "blocked", notes: [...task.notes, questionNote] }, message },
  });
}

/** The human answers; the task goes back to its assignee (or the inbox) and the paused session resumes. */
export function answerQuestion(
  model: ReadModel,
  taskId: TaskId,
  text: string,
  ctx: CommandContext,
): CommandResult<{ task: Task; message: ChatMessage }> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  const message: ChatMessage = {
    id: ctx.ids.chatMessage(),
    author: { kind: "human" },
    text,
    taskId: task.id,
    at: ctx.now,
  };
  const answerNote = note(ctx, "answer", text);
  const events: NewEvent[] = [
    { type: "chat.message_posted", actor: ctx.actor, payload: { message, author: message.author } },
    noteEvent(ctx, task, answerNote),
  ];
  let next: Task = { ...task, notes: [...task.notes, answerNote] };
  if (task.status === "blocked") {
    const to: TaskStatus = task.assigneeId === undefined ? "planned" : "assigned";
    events.push(statusChange(ctx, task, to, "answered"));
    next = { ...next, status: to };
  }
  return ok({ events, value: { task: next, message } });
}
