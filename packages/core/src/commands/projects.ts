import type { Project, ProjectCreateInput, ProjectId, ProjectUpdateInput } from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { isTerminal } from "../tasks/transitions.ts";
import type { CommandContext, CommandResult } from "./context.ts";

const nameTaken = (model: ReadModel, name: string, except?: ProjectId): boolean =>
  [...model.projects.values()].some(
    (p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase(),
  );

export function createProject(
  model: ReadModel,
  input: ProjectCreateInput,
  ctx: CommandContext,
): CommandResult<Project> {
  if (nameTaken(model, input.name)) {
    return err(conflict(`project name "${input.name}" is already used`));
  }
  const project: Project = {
    id: ctx.ids.project(),
    ...input,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return ok({
    events: [{ type: "project.created", actor: ctx.actor, payload: { project } }],
    value: project,
  });
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
  const project: Project = { ...current, ...definedOnly(input.patch), updatedAt: ctx.now };
  return ok({
    events: [{ type: "project.updated", actor: ctx.actor, payload: { project } }],
    value: project,
  });
}

export function removeProject(
  model: ReadModel,
  id: ProjectId,
  ctx: CommandContext,
): CommandResult<ProjectId> {
  const current = model.projects.get(id);
  if (current === undefined) {
    return err(notFound("project", id));
  }
  if (current.repo.kind === "none") {
    return err(conflict("the office itself cannot be removed"));
  }
  const open = [...model.tasks.values()].filter(
    (t) => t.projectId === id && !isTerminal(t.status),
  ).length;
  if (open > 0) {
    return err(conflict(`project has ${String(open)} open task(s); finish or cancel them first`));
  }
  return ok({
    events: [{ type: "project.removed", actor: ctx.actor, payload: { projectId: id } }],
    value: id,
  });
}

/** Drops `undefined` values so a partial patch never erases fields under exactOptionalPropertyTypes. */
export const definedOnly = <T extends object>(
  patch: T,
): { [K in keyof T]: Exclude<T[K], undefined> } => {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  /* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot express the mapped type */
  return Object.fromEntries(entries) as { [K in keyof T]: Exclude<T[K], undefined> };
};
