import type { Agent, NewEvent, Project, Task, TaskId, TaskNote, TaskStatus } from "@ho/protocol";
import { type DomainError, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok, type Result } from "../result.ts";
import type { CommandContext } from "./context.ts";

/** Agents refer to colleagues and projects by name in tool calls; ids also work. */
export const findAgentByRef = (model: ReadModel, ref: string): Agent | undefined =>
  [...model.agents.values()].find(
    (a) => a.id === ref || a.name.toLowerCase() === ref.toLowerCase(),
  );
export const findProjectByRef = (model: ReadModel, ref: string): Project | undefined =>
  [...model.projects.values()].find(
    (p) => p.id === ref || p.name.toLowerCase() === ref.toLowerCase(),
  );

export const officeProject = (model: ReadModel): Project | undefined =>
  [...model.projects.values()].find((p) => p.repo.kind === "none");
export const bossAgent = (model: ReadModel): Agent | undefined =>
  [...model.agents.values()].find((a) => a.role === "boss");

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
  payload: { taskId: task.id, from: task.status, to, ...(reason === undefined ? {} : { reason }) },
});

export const requireTask = (model: ReadModel, taskId: TaskId): Result<Task, DomainError> => {
  const task = model.tasks.get(taskId);
  return task === undefined ? err(notFound("task", taskId)) : ok(task);
};
