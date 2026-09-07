import type { AgentId } from "@ho/protocol";
import { type Facing, type Grid, type Point, samePoint } from "./grid.ts";
import { createRng, hashSeed, type Rng } from "./rng.ts";
import { type Anchor, type AnchorKind, type FloorTemplate, gridFor } from "./templates.ts";

export type Activity =
  | "idle"
  | "walk"
  | "type"
  | "drink"
  | "sleep"
  | "handover"
  | "receive"
  | "drop"
  | "celebrate"
  | "smoke"
  | "relax"
  | "restroom";
export type Emotion =
  | "focused"
  | "happy"
  | "frustrated"
  | "question"
  | "sleepy"
  | "relaxed"
  | "talking"
  | "envelope";
export type NeedKind = "coffee" | "restroom" | "smoke" | "relax";
export const NEEDS: readonly NeedKind[] = ["coffee", "restroom", "smoke", "relax"];

export type Step =
  | { kind: "walk"; floorId: string; to: Point; path: Point[] | null; blockedMs?: number }
  | { kind: "elevator"; toFloorId: string; until: number | null }
  | { kind: "dwell"; activity: Activity; facing: Facing | null; until: number | null; ms: number }
  | { kind: "hold"; activity: Activity; facing: Facing | null }
  | { kind: "emit"; event: SimEvent };

export type SimEvent =
  | { kind: "handoff_delivered"; from: AgentId; to: AgentId }
  | { kind: "arrived"; agentId: AgentId; anchorId: string | null }
  /** The postman left the envelope in the mailbox. */
  | { kind: "mail_dropped"; mailId: string }
  /** A courier handed the envelope to the boss. */
  | { kind: "mail_delivered"; mailId: string; by: AgentId; to: AgentId }
  /** A visitor walked out; the host removes the actor. */
  | { kind: "visitor_left"; actorId: AgentId };

/** Agents are the office's staff; visitors (the postman) come and go and never idle around. */
export type ActorKind = "agent" | "visitor";

export type Actor = {
  id: AgentId;
  kind: ActorKind;
  sprite: string;
  floorId: string;
  pos: Point;
  tile: Point;
  facing: Facing;
  activity: Activity;
  animTime: number;
  hidden: boolean;
  /** The cell this actor is currently stepping into (claimed so nobody else enters it at the same time). */
  moving: Point | null;
  steps: Step[];
  reservation: { floorId: string; anchorId: string } | null;
  work: { floorId: string; anchorId: string } | null;
  needs: Record<NeedKind, number>;
  emotion: { kind: Emotion; until: number | null } | null;
  idleUntil: number;
};

export type Floor = { template: FloorTemplate; grid: Grid; reservations: Map<string, AgentId> };

export type ElevatorPhase = "closed" | "opening" | "open" | "closing";
/**
 * Everybody enters by elevator. Newcomers wait hidden in `queue`; one at a time a car "arrives": the passenger is
 * revealed inside the car behind the closed doors, the doors open (`amount` 0 → 1), the passenger walks out, the
 * doors stay open while anybody is in the car or on its threshold, close, pause, and the next car comes. Anyone
 * walking into the car from the office (a leaving visitor) opens the doors the same way.
 */
export type Elevator = {
  queue: AgentId[];
  phase: ElevatorPhase;
  /** Door position, 0 closed … 1 open; the renderer maps it onto the door frames. */
  amount: number;
  /** The passenger of the current car, waiting for the doors to open. */
  passenger: AgentId | null;
  /** Earliest time the next car may arrive (a pause after the doors close). */
  nextAt: number;
};

export type World = {
  time: number;
  rng: Rng;
  floors: Map<string, Floor>;
  actors: Map<AgentId, Actor>;
  outbox: SimEvent[];
  elevator: Elevator;
  /** Animation positions the simulation drives, by sprite key (`elevator-doors` → door amount 0…1). */
  animations: Map<string, number>;
};

export const SPEED_TILES_PER_S = 3;
export const ELEVATOR_MS = 1500;
/** Door travel of the elevator (matches the renderer), the pause on the threshold, the gap between cars. */
export const ELEVATOR_DOORS_MS = 700;

export const createWorld = (seed: string): World => ({
  time: 0,
  rng: createRng(hashSeed(seed)),
  floors: new Map(),
  actors: new Map(),
  outbox: [],
  elevator: { queue: [], phase: "closed", amount: 0, passenger: null, nextAt: 0 },
  animations: new Map(),
});

export function addFloor(world: World, template: FloorTemplate): void {
  world.floors.set(template.id, { template, grid: gridFor(template), reservations: new Map() });
}

export function removeFloor(world: World, floorId: string): void {
  world.floors.delete(floorId);
}

const anchorById = (floor: Floor, id: string): Anchor | undefined =>
  floor.template.anchors.find((a) => a.id === id);

export const freeAnchors = (world: World, floorId: string, kind: AnchorKind): Anchor[] => {
  const floor = world.floors.get(floorId);
  return floor === undefined
    ? []
    : floor.template.anchors.filter((a) => a.kind === kind && !floor.reservations.has(a.id));
};

export function reserve(world: World, actor: Actor, floorId: string, anchorId: string): boolean {
  const floor = world.floors.get(floorId);
  if (floor === undefined || floor.reservations.has(anchorId)) {
    return false;
  }
  release(world, actor);
  floor.reservations.set(anchorId, actor.id);
  actor.reservation = { floorId, anchorId };
  return true;
}

export function release(world: World, actor: Actor): void {
  if (actor.reservation !== null) {
    world.floors.get(actor.reservation.floorId)?.reservations.delete(actor.reservation.anchorId);
    actor.reservation = null;
  }
}

export function spawnActor(
  world: World,
  id: AgentId,
  sprite: string,
  floorId: string,
  options: { kind?: ActorKind; at?: Point } = {},
): Actor {
  const floor = world.floors.get(floorId);
  const spawn =
    options.at ??
    (floor === undefined
      ? { x: 3, y: 10 }
      : (anchorById(floor, "car")?.at ?? anchorById(floor, "elevator")?.at ?? { x: 3, y: 10 }));
  const at = nearestWalkable(world, floorId, spawn);
  // Without an explicit place the newcomer arrives by elevator: hidden in the car until it is their turn.
  const arriving = options.at === undefined;
  const actor: Actor = {
    id,
    kind: options.kind ?? "agent",
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
    world.elevator.queue.push(id);
  }
  return actor;
}

export function removeActor(world: World, id: AgentId): void {
  const actor = world.actors.get(id);
  if (actor !== undefined) {
    release(world, actor);
    world.actors.delete(id);
  }
  world.elevator.queue = world.elevator.queue.filter((queued) => queued !== id);
  if (world.elevator.passenger === id) {
    world.elevator.passenger = null;
  }
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

/** A walk to a point on any floor; the executor inserts the elevator ride when the floor differs. */
export const walkSteps = (_world: World, _actor: Actor, floorId: string, to: Point): Step[] => [
  { kind: "walk", floorId, to, path: null },
];

/** Steps that bring a working actor back to its desk and keep it typing. */
export function resumeSteps(world: World, actor: Actor): Step[] {
  if (actor.work === null) {
    return [];
  }
  const anchor = anchorOf(world, actor.work.floorId, actor.work.anchorId);
  return anchor === undefined
    ? []
    : [
        { kind: "walk", floorId: actor.work.floorId, to: anchor.at, path: null },
        { kind: "hold", activity: "type", facing: anchor.facing },
      ];
}

export const setSteps = (actor: Actor, steps: Step[]): void => {
  actor.steps = steps;
  actor.animTime = 0;
};

export const NEED_PERIOD_MS: Record<NeedKind, number> = {
  coffee: 240_000,
  restroom: 420_000,
  smoke: 600_000,
  relax: 360_000,
};

export const anchorOf = (world: World, floorId: string, anchorId: string): Anchor | undefined => {
  const floor = world.floors.get(floorId);
  return floor === undefined ? undefined : anchorById(floor, anchorId);
};

export const isAt = (actor: Actor, p: Point): boolean =>
  samePoint(actor.tile, p) && actor.steps.length === 0;
