import {
  type Agent,
  type AgentCopyInput,
  type AgentCreateInput,
  type AgentId,
  type AgentUpdateInput,
  compact,
  type ProjectId,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { defaultChoice, validateChoice } from "../providers.ts";
import { isTerminal } from "../tasks/transitions.ts";
import { isSessionActive } from "./sessions.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { copyOf } from "./office-defaults.ts";
import { bossOf, membersOf } from "./shared.ts";

/** Names are unique per floor: Andrew runs every floor, Pam may work on two. */
const nameTaken = (
  model: ReadModel,
  projectId: ProjectId,
  name: string,
  except?: AgentId,
): boolean =>
  membersOf(model, projectId).some(
    (a) => a.id !== except && a.name.toLowerCase() === name.toLowerCase(),
  );

export function createAgent(
  model: ReadModel,
  input: AgentCreateInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  if (!model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  if (nameTaken(model, input.projectId, input.name)) {
    return err(conflict(`agent name "${input.name}" is already used on this floor`));
  }
  if (input.role === "boss" && bossOf(model, input.projectId) !== undefined) {
    return err(conflict("this floor already has a boss"));
  }
  const auth = input.auth ?? defaultChoice(input.provider).auth;
  const choice = validateChoice({
    provider: input.provider,
    auth,
    model: input.model,
    effort: input.effort,
  });
  if (!choice.ok) {
    return choice;
  }
  const agent: Agent = {
    id: ctx.ids.agent(),
    ...input,
    auth,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
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
  if (
    input.patch.name !== undefined &&
    nameTaken(model, current.projectId, input.patch.name, input.id)
  ) {
    return err(conflict(`agent name "${input.patch.name}" is already used on this floor`));
  }
  if (input.patch.role !== undefined && input.patch.role !== current.role) {
    if (current.role === "boss") {
      return err(conflict("the floor's boss keeps the boss role"));
    }
    if (input.patch.role === "boss") {
      return err(conflict("this floor already has a boss"));
    }
  }
  const merged: Agent = { ...current, ...compact(input.patch), updatedAt: ctx.now };
  // A provider switch keeps whatever still fits and takes the new provider's defaults for the rest.
  const agent: Agent =
    input.patch.provider !== undefined && input.patch.provider !== current.provider
      ? { ...merged, ...defaultChoice(merged.provider), ...compact(input.patch) }
      : merged;
  const choice = validateChoice(agent);
  if (!choice.ok) {
    return choice;
  }
  return ok({
    events: [{ type: "agent.updated", actor: ctx.actor, payload: { agent } }],
    value: agent,
  });
}

/** Puts a copy of a character onto another floor (the import of D23). Bosses stay where they are. */
export function copyAgent(
  model: ReadModel,
  input: AgentCopyInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  const source = model.agents.get(input.id);
  if (source === undefined) {
    return err(notFound("agent", input.id));
  }
  if (!model.projects.has(input.projectId)) {
    return err(notFound("project", input.projectId));
  }
  if (source.role === "boss") {
    return err(conflict("every floor has its own boss; copy the staff instead"));
  }
  if (source.projectId === input.projectId && input.name === undefined) {
    return err(conflict("a copy on the same floor needs a different name"));
  }
  const name = input.name ?? source.name;
  if (nameTaken(model, input.projectId, name)) {
    return err(conflict(`agent name "${name}" is already used on this floor`));
  }
  const agent = copyOf(source, input.projectId, name, ctx);
  return ok({
    events: [{ type: "agent.created", actor: ctx.actor, payload: { agent } }],
    value: agent,
  });
}

export function removeAgent(
  model: ReadModel,
  id: AgentId,
  ctx: CommandContext,
): CommandResult<AgentId> {
  const agent = model.agents.get(id);
  if (agent === undefined) {
    return err(notFound("agent", id));
  }
  if (agent.role === "boss" && model.projects.has(agent.projectId)) {
    return err(conflict("the boss leaves with the floor; remove the project instead"));
  }
  const busy = [...model.tasks.values()].filter(
    (t) => (t.assigneeId === id || t.reviewerId === id) && !isTerminal(t.status),
  ).length;
  if ([...model.sessions.values()].some((s) => s.agentId === id && isSessionActive(s.state))) {
    return err(conflict("agent has an active session"));
  }
  if (busy > 0) {
    return err(conflict(`agent has ${String(busy)} active task(s); reassign them first`));
  }
  return ok({
    events: [{ type: "agent.removed", actor: ctx.actor, payload: { agentId: id } }],
    value: id,
  });
}
