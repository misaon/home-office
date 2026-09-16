import {
  type Agent,
  compact,
  conflict,
  type NewEvent,
  notFound,
  patched,
  type Project,
  type ProjectCreateInput,
  type ProjectId,
  type ProjectUpdateInput,
} from "@ho/protocol";
import { activeSessionOfTask, membersOf, tasksOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, entity, err, ok } from "../result.ts";
import { bossFor, copyOf } from "./office-defaults.ts";
import { withProject } from "./shared.ts";
import { isTerminal } from "./tasks.ts";

const readProject =
  (id: ProjectId) =>
  (model: ReadModel): Project =>
    entity(model.projects, id);

const nameTaken = (model: ReadModel, name: string, except?: ProjectId): boolean =>
  [...model.projects.values()].some(
    (p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase(),
  );

const sameRepo = (a: Project["repo"], b: Project["repo"]): boolean =>
  a.kind === "local" && b.kind === "local"
    ? a.path === b.path
    : a.kind === "git" && b.kind === "git" && a.url === b.url;

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
  return ok({ events, read: readProject(project.id) });
}

export function updateProject(
  model: ReadModel,
  input: ProjectUpdateInput,
  ctx: CommandContext,
): CommandResult<Project> {
  return withProject(model, input.id, (current) => {
    const { patch } = input;
    if (patch.name !== undefined && nameTaken(model, patch.name, input.id)) {
      return err(conflict(`project name "${patch.name}" is already used`));
    }
    if (patch.repo !== undefined && !sameRepo(current.repo, patch.repo)) {
      return err(conflict("a floor's repository cannot change; create a new floor"));
    }
    const project: Project = {
      ...current,
      ...compact({ name: patch.name, repo: patch.repo, defaultBranch: patch.defaultBranch }),
      publish: patched(current.publish, patch.publish),
      intake: patched(current.intake, patch.intake),
      hiring: patched(current.hiring, patch.hiring),
      preview: patched(current.preview, patch.preview),
      services: patched(current.services, patch.services),
      verify: patched(current.verify, patch.verify),
      updatedAt: ctx.now,
    };
    return ok({
      events: [{ type: "project.updated", actor: ctx.actor, payload: { project } }],
      read: readProject(project.id),
    });
  });
}

export function removeProject(
  model: ReadModel,
  id: ProjectId,
  ctx: CommandContext,
): CommandResult<ProjectId> {
  return withProject(model, id, () => {
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
    return ok({ events, read: () => id });
  });
}
