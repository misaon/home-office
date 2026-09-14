import type { AgentId, Facing } from "@ho/protocol";
import type { Grid, Point } from "./grid.ts";
import { type Anchor, type AnchorKind, type FloorTemplate, gridFromMap } from "./map.ts";
import { createRng, hashSeed, type Rng } from "./rng.ts";

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
  | {
      kind: "walk";
      floorId: string;
      to: Point;
      path: Point[] | null;
      blockedMs?: number;
      /** After a side-step the path is only the step aside; plan again from there instead of finishing. */
      replan?: boolean;
    }
  | { kind: "dwell"; activity: Activity; facing: Facing | null; until: number | null; ms: number }
  | { kind: "hold"; activity: Activity; facing: Facing | null }
  /** Leaves the floor by the elevator (the actor must stand in the car) and comes back after `ms`. */
  | { kind: "away"; ms: number }
  | { kind: "emit"; event: SimEvent }
  | { kind: "release" };

/** Envelopes with this ref still queued for delivery: none means nobody will ever hand it over. */
export const inFlight = (world: World, ref: string): number => {
  let count = 0;
  for (const actor of world.actors.values()) {
    for (const step of actor.steps) {
      if (step.kind === "emit" && step.event.kind === "delivered" && step.event.ref === ref) {
        count += 1;
      }
    }
  }
  return count;
};

export type SimEvent =
  /** A carrier handed an envelope — `ref` names it (a task id, a mail id) — to a colleague. */
  | { kind: "delivered"; ref: string; by: AgentId; to: AgentId }
  /** The postman left the envelope at the reception. */
  | { kind: "mail_dropped"; ref: string }
  /** A visitor walked out; the host removes the actor. */
  | { kind: "visitor_left"; actorId: AgentId };

/**
 * Who an actor is in the office: the floor's boss (stays in his office), an agent of the staff, the
 * receptionist (an office character, never an agent) or a visitor (the postman) who comes and goes.
 */
export type ActorKind = "boss" | "staff" | "receptionist" | "visitor";

export type Actor = {
  id: AgentId;
  kind: ActorKind;
  floorId: string;
  pos: Point;
  tile: Point;
  facing: Facing;
  activity: Activity;
  hidden: boolean;
  /** The cell this actor is currently stepping into (claimed so nobody else enters it at the same time). */
  moving: Point | null;
  steps: Step[];
  reservation: { floorId: string; anchorId: string } | null;
  work: { floorId: string; anchorId: string } | null;
  /** Where the actor belongs when nothing else is going on (the boss's desk, the reception counter). */
  home: { floorId: string; anchorId: string } | null;
  /** Set while the actor is off the floor by elevator; the car brings them back at this time (or earlier). */
  awayUntil: number | null;
  needs: Record<NeedKind, number>;
  emotion: { kind: Emotion; until: number | null } | null;
  idleUntil: number;
  /** Per-actor offset on the blocked-walker wait, so two blocked walkers do not replan on the same frame. */
  detourJitterMs: number;
};

/**
 * Everybody enters by elevator. Newcomers wait hidden in `queue`; one at a time a car "arrives": the passenger is
 * revealed inside the car behind the closed doors, the doors open (`amount` 0 → 1), the passenger walks out, the
 * doors stay open while anybody is in the car or on its threshold, close, pause, and the next car comes. Anyone
 * walking into the car from the office (a leaving visitor, staff off for a while) opens the doors the same way.
 */
type Elevator = {
  queue: AgentId[];
  phase: "closed" | "opening" | "open" | "closing";
  /** Door position, 0 closed … 1 open. */
  amount: number;
  /** The passenger of the current car, waiting for the doors to open. */
  passenger: AgentId | null;
  /** Earliest time the next car may arrive (a pause after the doors close). */
  nextAt: number;
};

/** One floor: its compiled office, collision grid, anchor reservations and elevator. */
export type Floor = {
  template: FloorTemplate;
  grid: Grid;
  reservations: Map<string, AgentId>;
  elevator: Elevator;
};

export type World = {
  time: number;
  rng: Rng;
  floors: Map<string, Floor>;
  actors: Map<AgentId, Actor>;
  outbox: SimEvent[];
};

export const SPEED_TILES_PER_S = 3;
/** Door travel of the elevator, the pause on the threshold, the gap between cars. */
export const ELEVATOR_DOORS_MS = 700;

export const createWorld = (seed: string): World => ({
  time: 0,
  rng: createRng(hashSeed(seed)),
  floors: new Map(),
  actors: new Map(),
  outbox: [],
});

export function addFloor(world: World, template: FloorTemplate): void {
  world.floors.set(template.id, {
    template,
    grid: gridFromMap(template.map),
    reservations: new Map(),
    elevator: { queue: [], phase: "closed", amount: 0, passenger: null, nextAt: 0 },
  });
}

/** Drops a floor with everybody on it. */
export function removeFloor(world: World, floorId: string): void {
  world.floors.delete(floorId);
  for (const [id, actor] of world.actors) {
    if (actor.floorId === floorId) {
      world.actors.delete(id);
    }
  }
}

const anchorById = (floor: Floor, id: string): Anchor | undefined =>
  floor.template.anchors.find((a) => a.id === id);

/** Anchors marked `group: "boss"` (his office) are for the boss alone; everything else is shared. */
const allowedFor = (anchor: Anchor, kind: ActorKind | undefined): boolean =>
  anchor.group !== "boss" || kind === "boss";

/** Unreserved anchors of a kind on a floor, narrowed to what an actor of `forKind` may use. */
export const freeAnchors = (
  world: World,
  floorId: string,
  kind: AnchorKind,
  forKind?: ActorKind,
): Anchor[] => {
  const floor = world.floors.get(floorId);
  return floor === undefined
    ? []
    : floor.template.anchors.filter(
        (a) => a.kind === kind && !floor.reservations.has(a.id) && allowedFor(a, forKind),
      );
};

/** Claims an anchor for the actor; an anchor the actor already holds (its home) counts as claimed. */
export function reserve(world: World, actor: Actor, floorId: string, anchorId: string): boolean {
  const floor = world.floors.get(floorId);
  if (floor === undefined || anchorById(floor, anchorId) === undefined) {
    return false;
  }
  const holder = floor.reservations.get(anchorId);
  if (holder !== undefined && holder !== actor.id) {
    return false;
  }
  release(world, actor);
  floor.reservations.set(anchorId, actor.id);
  actor.reservation = { floorId, anchorId };
  return true;
}

/** Gives up the actor's current anchor — except its home, which stays reserved for as long as the actor exists. */
export function release(world: World, actor: Actor): void {
  const current = actor.reservation;
  if (current === null) {
    return;
  }
  const isHome =
    actor.home !== null &&
    actor.home.floorId === current.floorId &&
    actor.home.anchorId === current.anchorId;
  if (!isHome) {
    world.floors.get(current.floorId)?.reservations.delete(current.anchorId);
  }
  actor.reservation = isHome ? current : null;
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
