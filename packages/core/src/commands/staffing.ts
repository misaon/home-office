import type { Agent, NewEvent, ProjectId } from "@ho/protocol";
import { membersOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, ok } from "../result.ts";
import { DEFAULT_TEAM, hireDefault } from "./office-defaults.ts";
import { withProject } from "./shared.ts";

export function staffFloor(
  model: ReadModel,
  projectId: ProjectId,
  ctx: CommandContext,
): CommandResult<Agent[]> {
  return withProject(model, projectId, (project) => {
    const members = membersOf(model, projectId);
    const roles = new Set(members.map((agent) => agent.role));
    const names = new Set(members.map((agent) => agent.name.toLowerCase()));
    const hired = DEFAULT_TEAM.filter(
      (fields) => !roles.has(fields.role) && !names.has(fields.name.toLowerCase()),
    ).map((fields) => hireDefault(fields, projectId, ctx));
    const events: NewEvent[] = [
      ...hired.map((agent): NewEvent => ({
        type: "agent.created",
        actor: ctx.actor,
        payload: { agent },
      })),
      {
        type: "project.updated",
        actor: ctx.actor,
        payload: { project: { ...project, staffedAt: ctx.now, updatedAt: ctx.now } },
      },
    ];
    return ok({ events, read: () => hired });
  });
}
