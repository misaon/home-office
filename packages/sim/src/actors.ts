import type { AgentId } from "@ho/protocol";
import { type Point, samePoint } from "./grid.ts";
import {
  type Actor,
  type ActorKind,
  anchorOf,
  freeAnchors,
  release,
  reserve,
  type Step,
  type World,
} from "./world.ts";

/** How long the boss sits at his desk between two idle decisions. */
const HOME_MS = 25_000;

export function spawnActor(
  world: World,
  id: AgentId,
  sprite: string,
  floorId: string,
  options: { kind?: ActorKind; at?: Point } = {},
): Actor {
  const floor = world.floors.get(floorId);
  const spawn = options.at ??
    anchorOf(world, floorId, "car")?.at ??
    anchorOf(world, floorId, "elevator")?.at ?? { x: 3, y: 10 };
  const at = nearestWalkable(world, floorId, spawn);
  // Without an explicit place the newcomer arrives by elevator: hidden in the car until it is their turn.
  const arriving = options.at === undefined;
  const actor: Actor = {
    id,
    kind: options.kind ?? "staff",
    sprite,
    floorId,
    pos: { ...at },
    tile: { ...at },
    facing: "s",
    activity: "idle",
    animTime: 0,
    hidden: arriving,
    moving: null,
    steps: [],
    reservation: null,
    work: null,
    home: null,
    awayUntil: null,
    needs: {
      coffee: world.rng.next() * 0.4,
      restroom: world.rng.next() * 0.3,
      smoke: world.rng.next() * 0.2,
      relax: world.rng.next() * 0.3,
    },
    emotion: null,
    idleUntil: 0,
  };
  world.actors.set(id, actor);
  if (arriving) {
    floor?.elevator.queue.push(id);
  }
  return actor;
}

export function removeActor(world: World, id: AgentId): void {
  const actor = world.actors.get(id);
  if (actor === undefined) {
    return;
  }
  release(world, actor);
  for (const floor of world.floors.values()) {
    for (const [anchorId, owner] of floor.reservations) {
      if (owner === id) {
        floor.reservations.delete(anchorId);
      }
    }
  }
  world.actors.delete(id);
  const elevator = world.floors.get(actor.floorId)?.elevator;
  if (elevator !== undefined) {
    elevator.queue = elevator.queue.filter((queued) => queued !== id);
    if (elevator.passenger === id) {
      elevator.passenger = null;
    }
  }
}

/** Whether the actor is off the floor (away by elevator) or still waiting in the car to arrive. */
export const isOffFloor = (world: World, actor: Actor): boolean =>
  actor.hidden || (world.floors.get(actor.floorId)?.elevator.queue.includes(actor.id) ?? false);

/** Brings an actor who is away back at once: the next car carries them in. Nothing happens otherwise. */
export function summon(world: World, actor: Actor): void {
  const elevator = world.floors.get(actor.floorId)?.elevator;
  if (elevator === undefined || !actor.hidden || elevator.queue.includes(actor.id)) {
    return;
  }
  actor.awayUntil = null;
  elevator.queue.push(actor.id);
}

/** Gives an actor its place on the floor (reserved for as long as the actor exists). */
export function settleAt(world: World, actor: Actor, anchorId: string): boolean {
  if (!reserve(world, actor, actor.floorId, anchorId)) {
    return false;
  }
  actor.home = { floorId: actor.floorId, anchorId };
  return true;
}

/**
 * Cells other actors hold: where they stand, and — with `includeMoving` — the cell they are stepping into, so two
 * walkers never enter one cell together. Planning ignores walkers (they move on); stepping does not.
 */
export const occupied = (
  world: World,
  self: Actor,
  includeMoving = false,
): ((p: Point) => boolean) => {
  const taken = new Set<number>();
  for (const other of world.actors.values()) {
    if (other.id === self.id || other.floorId !== self.floorId || other.hidden) {
      continue;
    }
    if (other.activity !== "walk" || includeMoving) {
      taken.add(other.tile.y * 4096 + other.tile.x);
    }
    if (includeMoving && other.moving !== null) {
      taken.add(other.moving.y * 4096 + other.moving.x);
    }
  }
  return (p) => taken.has(p.y * 4096 + p.x);
};

export function nearestWalkable(world: World, floorId: string, target: Point): Point {
  const floor = world.floors.get(floorId);
  if (floor === undefined || floor.grid.isWalkable(target)) {
    return target;
  }
  for (let r = 1; r < 6; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const p = { x: target.x + dx, y: target.y + dy };
        if (floor.grid.isWalkable(p)) {
          return p;
        }
      }
    }
  }
  return target;
}

/** A walk to a point on the actor's floor. */
export const walkSteps = (_world: World, _actor: Actor, floorId: string, to: Point): Step[] => [
  { kind: "walk", floorId, to, path: null },
];

/** Steps that bring a working actor back to its desk and keep it typing; an idle actor goes home instead. */
export function resumeSteps(world: World, actor: Actor): Step[] {
  if (actor.work === null) {
    return homeSteps(world, actor);
  }
  const anchor = anchorOf(world, actor.work.floorId, actor.work.anchorId);
  return anchor === undefined
    ? []
    : [
        { kind: "walk", floorId: actor.work.floorId, to: anchor.at, path: null },
        { kind: "hold", activity: "type", facing: anchor.facing },
      ];
}

/**
 * Steps back to the actor's home spot: the receptionist stands behind her counter for good, the boss sits at
 * his desk for a while before he considers a coffee. Staff have no home: they walk to a stroll spot they may
 * use, which also takes a courier out of the boss's office after a handover.
 */
export function homeSteps(world: World, actor: Actor): Step[] {
  if (actor.home === null) {
    const spot = world.rng.pick(freeAnchors(world, actor.floorId, "wander", actor.kind));
    return spot === undefined ? [] : walkSteps(world, actor, actor.floorId, spot.at);
  }
  const anchor = anchorOf(world, actor.home.floorId, actor.home.anchorId);
  if (anchor === undefined) {
    return [];
  }
  const walk: Step = { kind: "walk", floorId: actor.home.floorId, to: anchor.at, path: null };
  return actor.kind === "receptionist"
    ? [walk, { kind: "hold", activity: "idle", facing: anchor.facing }]
    : [walk, { kind: "dwell", activity: "idle", facing: anchor.facing, until: null, ms: HOME_MS }];
}

export const setSteps = (actor: Actor, steps: Step[]): void => {
  actor.steps = steps;
  actor.animTime = 0;
};

export const isAt = (actor: Actor, p: Point): boolean =>
  samePoint(actor.tile, p) && actor.steps.length === 0;

export const pendingDeliveries = (actor: Actor): Step[] => {
  const index = actor.steps.findLastIndex(
    (step) =>
      step.kind === "emit" &&
      (step.event.kind === "handoff_delivered" || step.event.kind === "envelope_delivered"),
  );
  return index < 0 ? [] : actor.steps.slice(0, index + 1);
};
