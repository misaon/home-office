import {
  type Agent,
  type AgentCopyInput,
  type AgentCreateInput,
  type AgentId,
  type AgentUpdateInput,
  compact,
  conflict,
  isSessionActive,
  patched,
  type ProjectId,
} from "@ho/protocol";
import { bossOf, membersOf, sessionsOfAgent, tasksOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { defaultChoice, validateChoice } from "../providers.ts";
import { type CommandContext, type CommandResult, entity, err, ok } from "../result.ts";
import { copyOf } from "./office-defaults.ts";
import { withAgent, withProject } from "./shared.ts";
import { isTerminal } from "./tasks.ts";

const readAgent =
  (id: AgentId) =>
  (model: ReadModel): Agent =>
    entity(model.agents, id);

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
  return withProject(model, input.projectId, () => {
    if (nameTaken(model, input.projectId, input.name)) {
      return err(conflict(`agent name "${input.name}" is already used on this floor`));
    }
    if (input.role === "boss" && bossOf(model, input.projectId) !== undefined) {
      return err(conflict("this floor already has a boss"));
    }
    const agent: Agent = {
      id: ctx.ids.agent(),
      ...input,
      auth: input.auth ?? defaultChoice(input.provider, input.role).auth,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    const choice = validateChoice(agent);
    if (!choice.ok) {
      return choice;
    }
    return ok({
      events: [{ type: "agent.created", actor: ctx.actor, payload: { agent } }],
      read: readAgent(agent.id),
    });
  });
}

export function updateAgent(
  model: ReadModel,
  input: AgentUpdateInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  return withAgent(model, input.id, (current) => {
    const { budgets, ...patch } = input.patch;
    if (patch.name !== undefined && nameTaken(model, current.projectId, patch.name, input.id)) {
      return err(conflict(`agent name "${patch.name}" is already used on this floor`));
    }
    if (patch.role !== undefined && patch.role !== current.role) {
      if (current.role === "boss") {
        return err(conflict("the floor's boss keeps the boss role"));
      }
      if (patch.role === "boss") {
        return err(conflict("this floor already has a boss"));
      }
    }
    const base =
      patch.provider !== undefined && patch.provider !== current.provider
        ? { ...current, ...defaultChoice(patch.provider, patch.role ?? current.role) }
        : current;
    const agent: Agent = {
      ...base,
      ...compact(patch),
      budgets: patched(current.budgets, budgets),
      updatedAt: ctx.now,
    };
    const choice = validateChoice(agent);
    if (!choice.ok) {
      return choice;
    }
    return ok({
      events: [{ type: "agent.updated", actor: ctx.actor, payload: { agent } }],
      read: readAgent(agent.id),
    });
  });
}

export function copyAgent(
  model: ReadModel,
  input: AgentCopyInput,
  ctx: CommandContext,
): CommandResult<Agent> {
  return withAgent(model, input.id, (source) =>
    withProject(model, input.projectId, () => {
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
        read: readAgent(agent.id),
      });
    }),
  );
}

export function removeAgent(
  model: ReadModel,
  id: AgentId,
  ctx: CommandContext,
  reason?: string,
): CommandResult<AgentId> {
  return withAgent(model, id, (agent) => {
    if (agent.role === "boss" && model.projects.has(agent.projectId)) {
      return err(conflict("the boss leaves with the floor; remove the project instead"));
    }
    if (sessionsOfAgent(model, id).some((s) => isSessionActive(s.state))) {
      return err(conflict("agent has an active session"));
    }
    const busy = tasksOf(model, agent.projectId).filter(
      (t) => (t.assigneeId === id || t.reviewerId === id) && !isTerminal(t.status),
    ).length;
    if (busy > 0) {
      return err(conflict(`agent has ${String(busy)} active task(s); reassign them first`));
    }
    return ok({
      events: [
        {
          type: "agent.removed",
          actor: ctx.actor,
          payload: { agentId: id, ...compact({ reason }) },
        },
      ],
      read: () => id,
    });
  });
}
