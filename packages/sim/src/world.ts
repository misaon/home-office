import type { AgentId } from "@ho/protocol";
import { type Facing, type Grid, type Point, samePoint } from "./grid.ts";
import { createRng, hashSeed, type Rng } from "./rng.ts";
import { advanceStep } from "./steps.ts";
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
  | { kind: "walk"; floorId: string; to: Point; path: Point[] | null }
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
  steps: Step[];
  reservation: { floorId: string; anchorId: string } | null;
  work: { floorId: string; anchorId: string } | null;
  needs: Record<NeedKind, number>;
  emotion: { kind: Emotion; until: number | null } | null;
  idleUntil: number;
};

export type Floor = { template: FloorTemplate; grid: Grid; reservations: Map<string, AgentId> };

export type World = {
  time: number;
  rng: Rng;
  floors: Map<string, Floor>;
  actors: Map<AgentId, Actor>;
  outbox: SimEvent[];
};

export const SPEED_TILES_PER_S = 3;
export const ELEVATOR_MS = 1500;

export const createWorld = (seed: string): World => ({
  time: 0,
  rng: createRng(hashSeed(seed)),
  floors: new Map(),
  actors: new Map(),
  outbox: [],
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
      : (anchorById(floor, "elevator")?.at ?? { x: 3, y: 10 }));
  const at = nearestWalkable(world, floorId, spawn);
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
    hidden: false,
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
  return actor;
}

export function removeActor(world: World, id: AgentId): void {
  const actor = world.actors.get(id);
  if (actor !== undefined) {
    release(world, actor);
    world.actors.delete(id);
  }
}

/** Cells occupied by other actors standing still (walking actors are transient and ignored). */
export const occupied = (world: World, self: Actor): ((p: Point) => boolean) => {
  const taken = new Set<number>();
  for (const other of world.actors.values()) {
    if (
      other.id !== self.id &&
      other.floorId === self.floorId &&
      other.activity !== "walk" &&
      !other.hidden
    ) {
      taken.add(other.tile.y * 4096 + other.tile.x);
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

export function tick(
  world: World,
  dtMs: number,
  onIdle: (world: World, actor: Actor) => void,
): void {
  world.time += dtMs;
  for (const actor of world.actors.values()) {
    actor.animTime += dtMs;
    for (const need of NEEDS) {
      actor.needs[need] = Math.min(1, actor.needs[need] + dtMs / NEED_PERIOD_MS[need]);
    }
    if (
      actor.emotion !== null &&
      actor.emotion.until !== null &&
      world.time >= actor.emotion.until
    ) {
      actor.emotion = null;
    }
    if (actor.steps.length === 0) {
      if (actor.activity === "walk") {
        actor.activity = "idle";
      }
      if (world.time >= actor.idleUntil) {
        onIdle(world, actor);
      }
    }
    advanceStep(world, actor, dtMs);
  }
}

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
