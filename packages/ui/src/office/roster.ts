import { type Agent, type AgentId, compact } from "@ho/protocol";
import {
  addFloor,
  type Anchor,
  floorTemplate,
  freeDeskFor,
  RECEPTION_ANCHOR,
  removeActor,
  removeFloor,
  settleAt,
  spawnActor,
  type World,
} from "@ho/sim";
import { model } from "../store.ts";

type Kind = "boss" | "staff" | "receptionist";

const seatOf = (world: World, agent: Agent, kind: Kind): Anchor | undefined => {
  const anchors = world.floors.get(agent.projectId)?.template.anchors ?? [];
  if (kind === "boss") {
    return anchors.find((anchor) => anchor.kind === "boss-desk");
  }
  if (kind === "receptionist") {
    return anchors.find((anchor) => anchor.id === RECEPTION_ANCHOR);
  }
  return freeDeskFor(world, agent.projectId, agent.role, "staff");
};

function spawnAgent(world: World, agent: Agent, kind: Kind): void {
  const seat = seatOf(world, agent, kind);
  const actor = spawnActor(world, agent.id, agent.projectId, {
    kind,
    ...compact({ at: kind === "staff" ? undefined : seat?.at }),
  });
  if (seat !== undefined) {
    actor.facing = seat.facing;
    settleAt(world, actor, seat.id);
  }
}

const kindOf = (agent: Agent, receptionists: Map<string, AgentId>): Kind => {
  if (agent.role === "boss") {
    return "boss";
  }
  if (agent.role === "secretary" && (receptionists.get(agent.projectId) ?? agent.id) === agent.id) {
    receptionists.set(agent.projectId, agent.id);
    return "receptionist";
  }
  return "staff";
};

export function syncRoster(world: World, receptionists: Map<string, AgentId>): void {
  const known = new Set<string>();
  for (const project of model.projects.values()) {
    known.add(project.id);
    if (!world.floors.has(project.id)) {
      addFloor(world, floorTemplate(project.id));
    }
  }
  for (const [floorId] of world.floors) {
    if (!known.has(floorId)) {
      removeFloor(world, floorId);
      receptionists.delete(floorId);
    }
  }
  for (const [floorId, id] of receptionists) {
    const agent = model.agents.get(id);
    if (agent?.role !== "secretary" || agent.projectId !== floorId) {
      receptionists.delete(floorId);
    }
  }
  for (const agent of model.agents.values()) {
    if (!world.floors.has(agent.projectId)) {
      continue;
    }
    const kind = kindOf(agent, receptionists);
    const actor = world.actors.get(agent.id);
    if (actor !== undefined && (actor.floorId !== agent.projectId || actor.kind !== kind)) {
      removeActor(world, agent.id);
    }
    if (!world.actors.has(agent.id)) {
      spawnAgent(world, agent, kind);
    }
  }
  for (const [id, actor] of world.actors) {
    if (actor.kind !== "visitor" && !model.agents.has(id)) {
      removeActor(world, id);
    }
  }
}
