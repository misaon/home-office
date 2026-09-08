import {
  type Agent,
  type AgentId,
  compact,
  type NewEvent,
  type Project,
  type ProjectId,
  type Task,
  type TaskId,
  type TaskNote,
  type TaskStatus,
} from "@ho/protocol";
import { type DomainError, notFound } from "../errors.ts";
import { type ReadModel, resolve } from "../model/read-model.ts";
import { err, ok, type Result } from "../result.ts";
import type { CommandContext } from "./context.ts";

/** Enough of the model to find a floor's staff; the UI's immutable snapshot fits too. */
export type Roster = {
  agents: ReadonlyMap<AgentId, Agent>;
  agentsByProject: ReadonlyMap<ProjectId, ReadonlySet<AgentId>>;
};

/** The staff of one floor (its boss included). */
export const membersOf = (model: Roster, projectId: ProjectId): Agent[] =>
  resolve(model.agents, model.agentsByProject.get(projectId));

/** The floor's tasks, in creation order. */
export const tasksOf = (
  model: Pick<ReadModel, "tasks" | "tasksByProject">,
  projectId: ProjectId,
): Task[] => resolve(model.tasks, model.tasksByProject.get(projectId));

/** The floor's boss; every floor gets one when it is created, so `undefined` only shows up mid-removal. */
export const bossOf = (model: Roster, projectId: ProjectId): Agent | undefined =>
  membersOf(model, projectId).find((a) => a.role === "boss");

/** Agents refer to colleagues by name in tool calls; ids also work. Scoped to a floor when one is given. */
export const findAgentByRef = (
  model: ReadModel,
  ref: string,
  projectId?: ProjectId,
): Agent | undefined =>
  [...model.agents.values()].find(
    (a) =>
      (projectId === undefined || a.projectId === projectId) &&
      (a.id === ref || a.name.toLowerCase() === ref.toLowerCase()),
  );
export const findProjectByRef = (model: ReadModel, ref: string): Project | undefined =>
  [...model.projects.values()].find(
    (p) => p.id === ref || p.name.toLowerCase() === ref.toLowerCase(),
  );

/** Floors are numbered by creation order (the first project is floor 1). */
export const floorNumber = (model: ReadModel, projectId: ProjectId): number =>
  [...model.projects.values()]
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .findIndex((p) => p.id === projectId) + 1;

const TITLE_MAX = 200;

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

export const requireTask = (model: ReadModel, taskId: TaskId): Result<Task, DomainError> => {
  const task = model.tasks.get(taskId);
  return task === undefined ? err(notFound("task", taskId)) : ok(task);
};

export const requireAgent = (model: ReadModel, agentId: AgentId): Result<Agent, DomainError> => {
  const agent = model.agents.get(agentId);
  return agent === undefined ? err(notFound("agent", agentId)) : ok(agent);
};
