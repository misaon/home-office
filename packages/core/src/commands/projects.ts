import {
  type Agent,
  compact,
  type NewEvent,
  type Project,
  type ProjectCreateInput,
  type ProjectId,
  type ProjectUpdateInput,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { isTerminal } from "../tasks/transitions.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { bossFor, copyOf } from "./office-defaults.ts";
import { activeSessionOfTask } from "./sessions.ts";
import { membersOf, tasksOf } from "./shared.ts";

const nameTaken = (model: ReadModel, name: string, except?: ProjectId): boolean =>
  [...model.projects.values()].some(
    (p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase(),
  );

const sameRepo = (a: Project["repo"], b: Project["repo"]): boolean =>
  a.kind === "local" && b.kind === "local"
    ? a.path === b.path
    : a.kind === "git" && b.kind === "git" && a.url === b.url;

/**
 * A new floor: the project, its boss (Andrew) and copies of the characters imported from other floors. Bosses
 * are never imported (the floor has its own) and imported names must not collide with each other.
 */
export function createProject(
  model: ReadModel,
  input: ProjectCreateInput,
  ctx: CommandContext,
): CommandResult<Project> {
  if (nameTaken(model, input.name)) {
    return err(conflict(`project name "${input.name}" is already used`));
  }
  const duplicate = [...model.projects.values()].find((p) => sameRepo(p.repo, input.repo));
  if (duplicate !== undefined) {
    return err(conflict(`this repository is already floor "${duplicate.name}"`));
  }
  const { importAgentIds, ...fields } = input;
  const project: Project = {
    id: ctx.ids.project(),
    ...fields,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const boss = bossFor(project.id, ctx);
  const staff: Agent[] = [];
  const names = new Set([boss.name.toLowerCase()]);
  for (const id of new Set(importAgentIds)) {
    const source = model.agents.get(id);
    if (source === undefined) {
      return err(notFound("agent", id));
    }
    if (source.role === "boss") {
      continue;
    }
    if (names.has(source.name.toLowerCase())) {
      return err(conflict(`two imported characters are both called "${source.name}"`));
    }
    names.add(source.name.toLowerCase());
    staff.push(copyOf(source, project.id, source.name, ctx));
  }
  const events: NewEvent[] = [
    { type: "project.created", actor: ctx.actor, payload: { project } },
    ...[boss, ...staff].map((agent): NewEvent => ({
      type: "agent.created",
      actor: ctx.actor,
      payload: { agent },
    })),
  ];
  return ok({ events, value: project });
}

export function updateProject(
  model: ReadModel,
  input: ProjectUpdateInput,
  ctx: CommandContext,
): CommandResult<Project> {
  const current = model.projects.get(input.id);
  if (current === undefined) {
    return err(notFound("project", input.id));
  }
  if (input.patch.name !== undefined && nameTaken(model, input.patch.name, input.id)) {
    return err(conflict(`project name "${input.patch.name}" is already used`));
  }
  if (input.patch.repo !== undefined && !sameRepo(current.repo, input.patch.repo)) {
    return err(conflict("a floor's repository cannot change; create a new floor"));
  }
  const project: Project = { ...current, ...compact(input.patch), updatedAt: ctx.now };
  return ok({
    events: [{ type: "project.updated", actor: ctx.actor, payload: { project } }],
    value: project,
  });
}

/** Removes a floor with its staff; open tasks must be finished or cancelled first. Nobody may be mid-session. */
export function removeProject(
  model: ReadModel,
  id: ProjectId,
  ctx: CommandContext,
): CommandResult<ProjectId> {
  const current = model.projects.get(id);
  if (current === undefined) {
    return err(notFound("project", id));
  }
  const tasks = tasksOf(model, id);
  const open = tasks.filter((t) => !isTerminal(t.status)).length;
  if (open > 0) {
    return err(conflict(`project has ${String(open)} open task(s); finish or cancel them first`));
  }
  if (tasks.some((task) => activeSessionOfTask(model, task.id) !== undefined)) {
    return err(conflict("project has active sessions"));
  }
  const events: NewEvent[] = [
    ...membersOf(model, id).map((agent): NewEvent => ({
      type: "agent.removed",
      actor: ctx.actor,
      payload: { agentId: agent.id },
    })),
    { type: "project.removed", actor: ctx.actor, payload: { projectId: id } },
  ];
  return ok({ events, value: id });
}
