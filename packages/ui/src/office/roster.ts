import { type AgentId, compact, type ProjectId } from "@ho/protocol";
import {
  addFloor,
  floorTemplate,
  RECEPTION_ANCHOR,
  removeActor,
  removeFloor,
  settleAt,
  spawnActor,
  type World,
} from "@ho/sim";
import { model } from "../store.ts";

/** Adds a floor for a project (the same plane under the project's id) with Lola at the reception spot. */
function ensureFloor(
  world: World,
  receptionists: Map<string, AgentId>,
  newId: () => AgentId,
  floorId: ProjectId,
): void {
  if (world.floors.has(floorId)) {
    return;
  }
  const template = floorTemplate(floorId);
  addFloor(world, template);
  const counter = template.anchors.find((a) => a.id === RECEPTION_ANCHOR);
  if (counter !== undefined) {
    const id = newId();
    const lola = spawnActor(world, id, floorId, { kind: "receptionist", at: counter.at });
    lola.facing = counter.facing;
    settleAt(world, lola, counter.id);
    receptionists.set(floorId, id);
  }
}

/** The boss starts at his desk (his office is his home); the staff arrive by the elevator. */
function spawnAgent(world: World, id: AgentId, floorId: ProjectId, boss: boolean): void {
  if (!boss) {
    spawnActor(world, id, floorId, { kind: "staff" });
    return;
  }
  const desk = world.floors.get(floorId)?.template.anchors.find((a) => a.kind === "boss-desk");
  const actor = spawnActor(world, id, floorId, { kind: "boss", ...compact({ at: desk?.at }) });
  if (desk !== undefined) {
    actor.facing = desk.facing;
    settleAt(world, actor, desk.id);
  }
}

/**
 * Reconciles floors and actors with the read model: one floor per project, one actor per agent, Lola on each.
 */
export function syncRoster(
  world: World,
  receptionists: Map<string, AgentId>,
  newId: () => AgentId,
): void {
  const known = new Set<string>();
  for (const project of model.projects.values()) {
    known.add(project.id);
    ensureFloor(world, receptionists, newId, project.id);
  }
  for (const [floorId] of world.floors) {
    if (!known.has(floorId)) {
      removeFloor(world, floorId);
      receptionists.delete(floorId);
    }
  }
  for (const agent of model.agents.values()) {
    // A floor is ensured per project above; an agent of a floor that is gone gets no character.
    if (!world.floors.has(agent.projectId)) {
      continue;
    }
    const actor = world.actors.get(agent.id);
    if (actor !== undefined && actor.floorId !== agent.projectId) {
      removeActor(world, agent.id);
    }
    if (actor === undefined || actor.floorId !== agent.projectId) {
      spawnAgent(world, agent.id, agent.projectId, agent.role === "boss");
    }
  }
  for (const [id, actor] of world.actors) {
    if ((actor.kind === "staff" || actor.kind === "boss") && !model.agents.has(id)) {
      removeActor(world, id);
    }
  }
}
