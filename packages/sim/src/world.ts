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
      stuckMs?: number;
      retries?: number;
      yieldUntil?: number | undefined;
      replan?: boolean;
    }
  | { kind: "dwell"; activity: Activity; facing: Facing | null; until: number | null; ms: number }
  | { kind: "hold"; activity: Activity; facing: Facing | null }
  | { kind: "away"; ms: number }
  | { kind: "emit"; event: SimEvent }
  | { kind: "release" };

export type DeliveryRef = { kind: "task"; id: string } | { kind: "mail"; id: string };

const sameRef = (a: DeliveryRef, b: DeliveryRef): boolean => a.kind === b.kind && a.id === b.id;

const carries = (event: SimEvent, ref: DeliveryRef): boolean =>
  event.kind === "delivered"
    ? sameRef(event.ref, ref)
    : event.kind === "mail_dropped" && ref.kind === "mail" && event.ref === ref.id;

export const inFlight = (world: World, ref: DeliveryRef): number => {
  let count = 0;
  for (const actor of world.actors.values()) {
    for (const step of actor.steps) {
      if (step.kind === "emit" && carries(step.event, ref)) {
        count += 1;
      }
    }
  }
  return count;
};

export type SimEvent =
  | { kind: "delivered"; ref: DeliveryRef; by: AgentId; to: AgentId }
  | { kind: "mail_dropped"; ref: string }
  | { kind: "visitor_left"; actorId: AgentId };

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
  moving: Point | null;
  steps: Step[];
  reservation: { floorId: string; anchorId: string } | null;
  work: { floorId: string; anchorId: string } | null;
  home: { floorId: string; anchorId: string } | null;
  meeting: string | null;
  awayUntil: number | null;
  needs: Record<NeedKind, number>;
  emotion: { kind: Emotion; until: number | null } | null;
  idleUntil: number;
  detourJitterMs: number;
};

type Elevator = {
  queue: AgentId[];
  phase: "closed" | "opening" | "open" | "closing";
  amount: number;
  passenger: AgentId | null;
  nextAt: number;
};

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

const SPEED_TILES_PER_S = 3;
const RECEPTIONIST_SPEED_TILES_PER_S = 5;

export const speedOf = (actor: Actor): number =>
  actor.kind === "receptionist" ? RECEPTIONIST_SPEED_TILES_PER_S : SPEED_TILES_PER_S;
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

const allowedFor = (anchor: Anchor, kind: ActorKind | undefined): boolean =>
  anchor.group !== "boss" || kind === "boss";

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

export function forget(
  world: World,
  actor: Actor,
  held: { floorId: string; anchorId: string } | null,
): void {
  if (
    held === null ||
    (actor.home?.floorId === held.floorId && actor.home.anchorId === held.anchorId)
  ) {
    return;
  }
  const floor = world.floors.get(held.floorId);
  if (floor?.reservations.get(held.anchorId) === actor.id) {
    floor.reservations.delete(held.anchorId);
  }
  if (actor.reservation?.anchorId === held.anchorId) {
    actor.reservation = null;
  }
}

export function release(world: World, actor: Actor): void {
  const current = actor.reservation;
  if (current === null) {
    return;
  }
  const kept = [actor.home, actor.work].some(
    (held) =>
      held !== null && held.floorId === current.floorId && held.anchorId === current.anchorId,
  );
  if (!kept) {
    world.floors.get(current.floorId)?.reservations.delete(current.anchorId);
  }
  actor.reservation = kept ? current : null;
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
