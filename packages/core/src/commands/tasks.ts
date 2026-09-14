import {
  type Agent,
  compact,
  conflict,
  type DomainError,
  type NewEvent,
  notFound,
  type ProjectId,
  type Task,
  type TaskArtifacts,
  type TaskAssignInput,
  type TaskCreateInput,
  type TaskId,
  type TaskStatus,
  type TaskTransitionInput,
} from "@ho/protocol";
import { activeSessionOfTask, tasksOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import {
  type CommandContext,
  type CommandResult,
  entity,
  err,
  ok,
  type Result,
} from "../result.ts";
import { requireTask, statusChange } from "./shared.ts";

/**
 * The task state machine. Terminal states have no outgoing edges.
 * `in_progress → assigned` is a handoff or a question that paused the work; `review → assigned` is a review that
 * requested changes.
 */
const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  inbox: ["planned", "assigned", "blocked", "cancelled"],
  planned: ["assigned", "blocked", "cancelled"],
  assigned: ["in_progress", "planned", "blocked", "cancelled"],
  in_progress: ["review", "done", "assigned", "blocked", "failed", "cancelled"],
  review: ["done", "in_progress", "assigned", "blocked", "cancelled"],
  blocked: ["planned", "assigned", "in_progress", "cancelled"],
  failed: ["planned", "assigned", "cancelled"],
  done: [],
  cancelled: [],
};

export const canTransition = (from: TaskStatus, to: TaskStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const isTerminal = (status: TaskStatus): boolean => TRANSITIONS[status].length === 0;

/** Statuses a human may hand to somebody else; a task mid-session or under review is not reassigned. */
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

/** A fresh task: assigned when it has an assignee, otherwise waiting in the inbox. */
export const newTask = (
  ctx: CommandContext,
  fields: Pick<Task, "projectId" | "kind" | "title" | "brief" | "source"> & {
    assigneeId?: Task["assigneeId"] | undefined;
    priority?: Task["priority"] | undefined;
    notes?: Task["notes"] | undefined;
  },
): Task => ({
  id: ctx.ids.task(),
  projectId: fields.projectId,
  kind: fields.kind,
  title: fields.title,
  brief: fields.brief,
  status: fields.assigneeId === undefined ? "inbox" : "assigned",
  ...compact({ assigneeId: fields.assigneeId }),
  reviewRounds: 0,
  notes: fields.notes ?? [],
  source: fields.source,
  artifacts: {},
  priority: fields.priority ?? "normal",
  createdAt: ctx.now,
  updatedAt: ctx.now,
});

export const readTask =
  (id: TaskId) =>
  (model: ReadModel): Task =>
    entity(model.tasks, id);

export function createTask(
  model: ReadModel,
  input: TaskCreateInput,
  ctx: CommandContext,
): CommandResult<Task> {
  if (!model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  if (input.assigneeId !== undefined) {
    const check = assignable(model, input.assigneeId, input.projectId);
    if (!check.ok) {
      return check;
    }
  }
  const task = newTask(ctx, { ...input, kind: "work", source: { kind: "manual" } });
  return ok({
    events: [{ type: "task.created", actor: ctx.actor, payload: { task } }],
    read: readTask(task.id),
  });
}

export function assignTask(
  model: ReadModel,
  input: TaskAssignInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, input.id);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (!REASSIGNABLE.has(task.status)) {
    return err(conflict(`task in status "${task.status}" cannot be reassigned`));
  }
  if (input.agentId !== null) {
    const check = assignable(model, input.agentId, task.projectId);
    if (!check.ok) {
      return check;
    }
  }
  const events: NewEvent[] = [
    {
      type: "task.assigned",
      actor: ctx.actor,
      payload: { taskId: task.id, agentId: input.agentId },
    },
  ];
  if (input.agentId === null && task.status === "assigned") {
    events.push(statusChange(ctx, task, "planned", "unassigned"));
  } else if (
    input.agentId !== null &&
    task.status !== "assigned" &&
    canTransition(task.status, "assigned")
  ) {
    events.push(statusChange(ctx, task, "assigned"));
  }
  return ok({ events, read: readTask(task.id) });
}

export function transitionTask(
  model: ReadModel,
  input: TaskTransitionInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, input.id);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (!canTransition(task.status, input.to)) {
    return err({ code: "invalid_transition", from: task.status, to: input.to });
  }
  if ((input.to === "assigned" || input.to === "in_progress") && task.assigneeId === undefined) {
    return err(conflict("task has no assignee"));
  }
  return ok({ events: [statusChange(ctx, task, input.to, input.reason)], read: readTask(task.id) });
}

/** Merges into the task's artifacts (branch, pull request, report) whatever a session produced. */
export function patchTaskArtifacts(
  model: ReadModel,
  taskId: TaskId,
  artifacts: TaskArtifacts,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  return ok({
    events: [
      {
        type: "task.artifacts_changed",
        actor: ctx.actor,
        payload: { taskId, artifacts: { ...found.value.artifacts, ...artifacts } },
      },
    ],
    read: readTask(taskId),
  });
}

/**
 * Takes finished work off a floor's board. Only terminal tasks go, and only ones no session is still
 * holding: the board is a place of work in progress, and a done column that only ever grows stops being
 * one. What happened is not lost — the log keeps every event of a removed task, and so does its history.
 */
export function clearFinishedTasks(
  model: ReadModel,
  projectId: ProjectId,
  ctx: CommandContext,
): CommandResult<TaskId[]> {
  if (!model.projects.has(projectId)) {
    return err(notFound("project", projectId));
  }
  const finished = tasksOf(model, projectId).filter(
    (task) => isTerminal(task.status) && activeSessionOfTask(model, task.id) === undefined,
  );
  const events: NewEvent[] = finished.map((task) => ({
    type: "task.removed",
    actor: ctx.actor,
    payload: { taskId: task.id },
  }));
  return ok({ events, read: () => finished.map((task) => task.id) });
}

/**
 * One task off the board, whatever state it reached. The board belongs to the human: work that was
 * abandoned, asked a question nobody will answer, or was filed twice is theirs to take down. A task a
 * session is still holding stays, because removing it would strand the session that reports to it.
 */
export function removeTask(
  model: ReadModel,
  taskId: TaskId,
  ctx: CommandContext,
): CommandResult<TaskId> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  if (activeSessionOfTask(model, taskId) !== undefined) {
    return err(conflict("task has an active session; stop it first"));
  }
  return ok({
    events: [{ type: "task.removed", actor: ctx.actor, payload: { taskId } }],
    read: () => taskId,
  });
}
