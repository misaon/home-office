import {
  type Agent,
  compact,
  type NewEvent,
  type ProjectId,
  type Task,
  type TaskArtifactsInput,
  type TaskAssignInput,
  type TaskCreateInput,
  type TaskEditInput,
  type TaskStatus,
  type TaskTransitionInput,
} from "@ho/protocol";
import { conflict, type DomainError, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok, type Result } from "../result.ts";
import { canTransition } from "../tasks/transitions.ts";
import type { CommandContext, CommandResult } from "./context.ts";

const REASSIGNABLE: ReadonlySet<TaskStatus> = new Set([
  "inbox",
  "planned",
  "assigned",
  "blocked",
  "failed",
]);

/** An agent only works on its own floor (the boss included). */
const assignable = (
  model: ReadModel,
  agentId: Agent["id"],
  projectId: ProjectId,
): Result<Agent, DomainError> => {
  const agent = model.agents.get(agentId);
  if (agent === undefined) {
    return err(notFound("agent", agentId));
  }
  if (agent.projectId !== projectId) {
    return err(conflict(`agent "${agent.name}" works on another floor`));
  }
  return ok(agent);
};

export function createTask(
  model: ReadModel,
  input: TaskCreateInput,
  ctx: CommandContext,
): CommandResult<Task> {
  if (!model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  if (input.parentId !== undefined && !model.tasks.has(input.parentId)) {
    return err(notFound("task", input.parentId));
  }
  if (
    input.parentId !== undefined &&
    model.tasks.get(input.parentId)?.projectId !== input.projectId
  ) {
    return err(conflict("parent task belongs to another floor"));
  }
  if (input.assigneeId !== undefined) {
    const check = assignable(model, input.assigneeId, input.projectId);
    if (!check.ok) {
      return check;
    }
  }
  const task: Task = {
    id: ctx.ids.task(),
    projectId: input.projectId,
    ...compact({ parentId: input.parentId }),
    title: input.title,
    brief: input.brief,
    kind: "work",
    status: input.assigneeId === undefined ? "inbox" : "assigned",
    reviewRounds: 0,
    notes: [],
    ...compact({ assigneeId: input.assigneeId }),
    source:
      ctx.actor.kind === "agent"
        ? {
            kind: "delegation",
            byAgentId: ctx.actor.agentId,
            ...compact({ parentTaskId: input.parentId }),
          }
        : { kind: "manual" },
    artifacts: {},
    priority: input.priority,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return ok({
    events: [{ type: "task.created", actor: ctx.actor, payload: { task } }],
    value: task,
  });
}

export function editTask(
  model: ReadModel,
  input: TaskEditInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const task = model.tasks.get(input.id);
  if (task === undefined) {
    return err(notFound("task", input.id));
  }
  const { id, ...changes } = input;
  const next: Task = {
    ...task,
    ...compact(changes),
    updatedAt: ctx.now,
  };
  return ok({
    events: [{ type: "task.edited", actor: ctx.actor, payload: { taskId: id, ...changes } }],
    value: next,
  });
}

export function assignTask(
  model: ReadModel,
  input: TaskAssignInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const task = model.tasks.get(input.id);
  if (task === undefined) {
    return err(notFound("task", input.id));
  }
  if (!REASSIGNABLE.has(task.status)) {
    return err(conflict(`task in status "${task.status}" cannot be reassigned`));
  }
  const events: NewEvent[] = [];
  let next: Task = { ...task, updatedAt: ctx.now };
  if (input.agentId === null) {
    const { assigneeId: _dropped, ...rest } = next;
    next = rest;
    events.push({
      type: "task.assigned",
      actor: ctx.actor,
      payload: { taskId: task.id, agentId: null },
    });
    if (task.status === "assigned") {
      next = { ...next, status: "planned" };
      events.push({
        type: "task.status_changed",
        actor: ctx.actor,
        payload: { taskId: task.id, from: "assigned", to: "planned", reason: "unassigned" },
      });
    }
    return ok({ events, value: next });
  }
  const check = assignable(model, input.agentId, task.projectId);
  if (!check.ok) {
    return check;
  }
  next = { ...next, assigneeId: input.agentId };
  events.push({
    type: "task.assigned",
    actor: ctx.actor,
    payload: { taskId: task.id, agentId: input.agentId },
  });
  if (task.status !== "assigned" && canTransition(task.status, "assigned")) {
    next = { ...next, status: "assigned" };
    events.push({
      type: "task.status_changed",
      actor: ctx.actor,
      payload: { taskId: task.id, from: task.status, to: "assigned" },
    });
  }
  return ok({ events, value: next });
}

export function transitionTask(
  model: ReadModel,
  input: TaskTransitionInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const task = model.tasks.get(input.id);
  if (task === undefined) {
    return err(notFound("task", input.id));
  }
  if (!canTransition(task.status, input.to)) {
    return err({ code: "invalid_transition", from: task.status, to: input.to });
  }
  if ((input.to === "assigned" || input.to === "in_progress") && task.assigneeId === undefined) {
    return err(conflict("task has no assignee"));
  }
  const next: Task = { ...task, status: input.to, updatedAt: ctx.now };
  return ok({
    events: [
      {
        type: "task.status_changed",
        actor: ctx.actor,
        payload: {
          taskId: task.id,
          from: task.status,
          to: input.to,
          ...compact({ reason: input.reason }),
        },
      },
    ],
    value: next,
  });
}

export function setTaskArtifacts(
  model: ReadModel,
  input: TaskArtifactsInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const task = model.tasks.get(input.id);
  if (task === undefined) {
    return err(notFound("task", input.id));
  }
  const next: Task = { ...task, artifacts: input.artifacts, updatedAt: ctx.now };
  return ok({
    events: [
      {
        type: "task.artifacts_changed",
        actor: ctx.actor,
        payload: { taskId: task.id, artifacts: input.artifacts },
      },
    ],
    value: next,
  });
}
