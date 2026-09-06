import type { Agent, AgentCreateInput, AgentId, AgentUpdateInput, ProjectId } from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { isActive } from "../tasks/transitions.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { definedOnly } from "./projects.ts";

const nameTaken = (model: ReadModel, name: string, except?: AgentId): boolean =>
  [...model.agents.values()].some(
    (a) => a.id !== except && a.name.toLowerCase() === name.toLowerCase(),
  );

const bossExists = (model: ReadModel, except?: AgentId): boolean =>
  [...model.agents.values()].some((a) => a.id !== except && a.role === "boss");

const missingProject = (
  model: ReadModel,
  projectIds: readonly ProjectId[],
): ProjectId | undefined => projectIds.find((id) => !model.projects.has(id));

export function createAgent(
  model: ReadModel,
  input: AgentCreateInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  if (nameTaken(model, input.name)) {
    return err(conflict(`agent name "${input.name}" is already used`));
  }
  if (input.role === "boss" && bossExists(model)) {
    return err(conflict("the office already has a boss"));
  }
  const missing = missingProject(model, input.projectIds);
  if (missing !== undefined) {
    return err(notFound("project", missing));
  }
  const agent: Agent = { id: ctx.ids.agent(), ...input, createdAt: ctx.now, updatedAt: ctx.now };
  return ok({
    events: [{ type: "agent.created", actor: ctx.actor, payload: { agent } }],
    value: agent,
  });
}

export function updateAgent(
  model: ReadModel,
  input: AgentUpdateInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  const current = model.agents.get(input.id);
  if (current === undefined) {
    return err(notFound("agent", input.id));
  }
  if (input.patch.name !== undefined && nameTaken(model, input.patch.name, input.id)) {
    return err(conflict(`agent name "${input.patch.name}" is already used`));
  }
  if (input.patch.role === "boss" && bossExists(model, input.id)) {
    return err(conflict("the office already has a boss"));
  }
  const missing = missingProject(model, input.patch.projectIds ?? []);
  if (missing !== undefined) {
    return err(notFound("project", missing));
  }
  const agent: Agent = { ...current, ...definedOnly(input.patch), updatedAt: ctx.now };
  return ok({
    events: [{ type: "agent.updated", actor: ctx.actor, payload: { agent } }],
    value: agent,
  });
}

export function removeAgent(
  model: ReadModel,
  id: AgentId,
  ctx: CommandContext,
): CommandResult<AgentId> {
  if (!model.agents.has(id)) {
    return err(notFound("agent", id));
  }
  const busy = [...model.tasks.values()].filter(
    (t) => t.assigneeId === id && isActive(t.status),
  ).length;
  if (busy > 0) {
    return err(conflict(`agent has ${String(busy)} active task(s); reassign them first`));
  }
  return ok({
    events: [{ type: "agent.removed", actor: ctx.actor, payload: { agentId: id } }],
    value: id,
  });
}
