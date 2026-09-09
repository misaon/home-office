import { RECEPTIONIST } from "@ho/core";
import { type AgentId, compact, type ProjectId } from "@ho/protocol";
import {
  addFloor,
  type FloorTemplate,
  RECEPTION_ANCHOR,
  removeActor,
  removeFloor,
  settleAt,
  spawnActor,
  type World,
} from "@ho/sim";
import { model } from "../store.ts";

/** What the roster sync needs from the bridge: the world, the floors, Lola's ids and fresh ids. */
export type RosterHost = {
  world: World;
  templateFor: (floorId: string) => FloorTemplate;
  forgetFloor: (floorId: string) => void;
  receptionists: Map<string, AgentId>;
  newId: () => AgentId;
};

/** Adds a floor for a project (the same plane under the project's id) with Lola at the reception spot. */
function ensureFloor(host: RosterHost, floorId: ProjectId): void {
  if (host.world.floors.has(floorId)) {
    return;
  }
  const template = host.templateFor(floorId);
  addFloor(host.world, template);
  const counter = template.anchors.find((a) => a.id === RECEPTION_ANCHOR);
  if (counter !== undefined) {
    const id = host.newId();
    const lola = spawnActor(host.world, id, `characters/${RECEPTIONIST.spriteSet}`, floorId, {
      kind: "receptionist",
      at: counter.at,
    });
    lola.facing = counter.facing;
    settleAt(host.world, lola, counter.id);
    host.receptionists.set(floorId, id);
  }
}

/** The boss starts at his desk (his office is his home); the staff arrive by the elevator. */
function spawnAgent(
  host: RosterHost,
  id: AgentId,
  sprite: string,
  floorId: ProjectId,
  boss: boolean,
): void {
  if (!boss) {
    spawnActor(host.world, id, sprite, floorId, { kind: "staff" });
    return;
  }
  const desk = host.templateFor(floorId).anchors.find((a) => a.kind === "boss-desk");
  const actor = spawnActor(host.world, id, sprite, floorId, {
    kind: "boss",
    ...compact({ at: desk?.at }),
  });
  if (desk !== undefined) {
    actor.facing = desk.facing;
    settleAt(host.world, actor, desk.id);
  }
}

/** Reconciles floors and actors with the read model: one floor per project, one actor per agent, Lola on each. */
export function syncRoster(host: RosterHost): void {
  const { world } = host;
  const known = new Set<string>();
  for (const project of model.projects.values()) {
    known.add(project.id);
    ensureFloor(host, project.id);
  }
  for (const [floorId] of world.floors) {
    if (!known.has(floorId)) {
      removeFloor(world, floorId);
      host.receptionists.delete(floorId);
      host.forgetFloor(floorId);
    }
  }
  for (const agent of model.agents.values()) {
    const sprite = `characters/${agent.appearance.spriteSet}`;
    const actor = world.actors.get(agent.id);
    if (actor !== undefined && actor.floorId !== agent.projectId) {
      removeActor(world, agent.id);
    }
    if (actor === undefined || actor.floorId !== agent.projectId) {
      spawnAgent(host, agent.id, sprite, agent.projectId, agent.role === "boss");
    } else {
      actor.sprite = sprite;
    }
  }
  for (const [id, actor] of world.actors) {
    if ((actor.kind === "staff" || actor.kind === "boss") && !model.agents.has(id)) {
      removeActor(world, id);
    }
  }
}
