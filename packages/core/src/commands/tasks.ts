import {
  type Agent,
  compact,
  conflict,
  type DomainError,
  type NewEvent,
  notFound,
  type ProjectId,
  type ReviewPlan,
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
import { statusChange, withProject, withTask } from "./shared.ts";
import { checkDependencies, checkReviewers } from "./task-checks.ts";

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

const REASSIGNABLE: ReadonlySet<TaskStatus> = new Set([
  "inbox",
  "planned",
  "assigned",
  "blocked",
  "failed",
]);

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

const NO_REVIEWS: ReviewPlan = { qa: false, security: false, head: true };

export const newTask = (
  ctx: CommandContext,
  fields: Pick<Task, "projectId" | "kind" | "title" | "brief" | "source"> & {
    spec?: Task["spec"] | undefined;
    assigneeId?: Task["assigneeId"] | undefined;
    priority?: Task["priority"] | undefined;
    notes?: Task["notes"] | undefined;
    publish?: Task["publish"] | undefined;
    browser?: Task["browser"] | undefined;
    reviews?: Task["reviews"] | undefined;
    dependsOn?: Task["dependsOn"] | undefined;
  },
): Task => ({
  id: ctx.ids.task(),
  projectId: fields.projectId,
  kind: fields.kind,
  title: fields.title,
  brief: fields.brief,
  ...compact({ spec: fields.spec, publish: fields.publish, browser: fields.browser }),
  reviews: fields.reviews ?? NO_REVIEWS,
  status: fields.assigneeId === undefined ? "inbox" : "assigned",
  ...compact({ assigneeId: fields.assigneeId }),
  reviewRounds: 0,
  notes: fields.notes ?? [],
  dependsOn: fields.dependsOn ?? [],
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
  return withProject(model, input.projectId, () => {
    if (input.assigneeId !== undefined) {
      const check = assignable(model, input.assigneeId, input.projectId);
      if (!check.ok) {
        return check;
      }
    }
    const reviews = input.reviews ?? NO_REVIEWS;
    const reviewers = checkReviewers(model, {
      projectId: input.projectId,
      reviews,
      assigneeId: input.assigneeId,
    });
    if (!reviewers.ok) {
      return reviewers;
    }
    const dependencies = checkDependencies(model, input.projectId, input.dependsOn ?? []);
    if (!dependencies.ok) {
      return dependencies;
    }
    const task = newTask(ctx, {
      ...input,
      reviews,
      dependsOn: dependencies.value,
      kind: "work",
      source: { kind: "manual" },
    });
    return ok({
      events: [{ type: "task.created", actor: ctx.actor, payload: { task } }],
      read: readTask(task.id),
    });
  });
}

export function assignTask(
  model: ReadModel,
  input: TaskAssignInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, input.id, (task) => {
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
  });
}

export function transitionTask(
  model: ReadModel,
  input: TaskTransitionInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, input.id, (task) => {
    if (!canTransition(task.status, input.to)) {
      return err({ code: "invalid_transition", from: task.status, to: input.to });
    }
    if (input.to === "in_progress" && ctx.actor.kind !== "system") {
      return err(conflict("a task is in progress only while a session runs it; assign it instead"));
    }
    if ((input.to === "assigned" || input.to === "in_progress") && task.assigneeId === undefined) {
      return err(conflict("task has no assignee"));
    }
    return ok({
      events: [statusChange(ctx, task, input.to, input.reason)],
      read: readTask(task.id),
    });
  });
}

export function patchTaskArtifacts(
  model: ReadModel,
  taskId: TaskId,
  artifacts: TaskArtifacts,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) =>
    ok({
      events: [
        {
          type: "task.artifacts_changed",
          actor: ctx.actor,
          payload: { taskId, artifacts: { ...task.artifacts, ...artifacts } },
        },
      ],
      read: readTask(taskId),
    }),
  );
}

const hasOpenFollowUps = (model: ReadModel, task: Task): boolean =>
  tasksOf(model, task.projectId).some(
    (child) =>
      child.source.kind === "delegation" &&
      child.source.parentTaskId === task.id &&
      !isTerminal(child.status),
  );

export function clearFinishedTasks(
  model: ReadModel,
  projectId: ProjectId,
  ctx: CommandContext,
): CommandResult<TaskId[]> {
  return withProject(model, projectId, () => {
    const finished = tasksOf(model, projectId).filter(
      (task) =>
        isTerminal(task.status) &&
        activeSessionOfTask(model, task.id) === undefined &&
        !hasOpenFollowUps(model, task),
    );
    const events: NewEvent[] = finished.map((task) => ({
      type: "task.removed",
      actor: ctx.actor,
      payload: { taskId: task.id },
    }));
    return ok({ events, read: () => finished.map((task) => task.id) });
  });
}

export function removeTask(
  model: ReadModel,
  taskId: TaskId,
  ctx: CommandContext,
): CommandResult<TaskId> {
  return withTask(model, taskId, (task) => {
    if (activeSessionOfTask(model, taskId) !== undefined) {
      return err(conflict("task has an active session; stop it first"));
    }
    if (hasOpenFollowUps(model, task)) {
      return err(conflict("task still has open follow-up tasks delegated from it"));
    }
    return ok({
      events: [{ type: "task.removed", actor: ctx.actor, payload: { taskId } }],
      read: () => taskId,
    });
  });
}
