import type { AgentId } from "@ho/protocol";
import { key, manhattan, type Point } from "./grid.ts";
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

const HOME_MS = 25_000;

const JITTER_SPREAD_MS = 400;

const jitterFor = (id: AgentId): number => {
  let hash = 0;
  for (const ch of id) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % JITTER_SPREAD_MS;
  }
  return hash;
};

export function spawnActor(
  world: World,
  id: AgentId,
  floorId: string,
  options: { kind?: ActorKind; at?: Point } = {},
): Actor {
  const floor = world.floors.get(floorId);
  const spawn = options.at ??
    anchorOf(world, floorId, "car")?.at ??
    anchorOf(world, floorId, "elevator")?.at ?? { x: 3, y: 10 };
  const at = nearestWalkable(world, floorId, spawn);
  const arriving = options.at === undefined;
  const actor: Actor = {
    id,
    kind: options.kind ?? "staff",
    floorId,
    pos: { ...at },
    tile: { ...at },
    facing: "s",
    activity: "idle",
    hidden: arriving,
    moving: null,
    steps: [],
    reservation: null,
    work: null,
    home: null,
    meeting: null,
    awayUntil: null,
    needs: {
      coffee: world.rng.next() * 0.4,
      restroom: world.rng.next() * 0.3,
      smoke: world.rng.next() * 0.2,
      relax: world.rng.next() * 0.3,
    },
    emotion: null,
    idleUntil: 0,
    detourJitterMs: jitterFor(id),
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
  for (const held of [actor.reservation, actor.home, actor.work]) {
    if (held !== null) {
      const floor = world.floors.get(held.floorId);
      if (floor?.reservations.get(held.anchorId) === id) {
        floor.reservations.delete(held.anchorId);
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

export function summon(world: World, actor: Actor): void {
  const elevator = world.floors.get(actor.floorId)?.elevator;
  if (elevator === undefined || !actor.hidden || elevator.queue.includes(actor.id)) {
    return;
  }
  actor.awayUntil = null;
  elevator.queue.push(actor.id);
}

export function settleAt(world: World, actor: Actor, anchorId: string): boolean {
  if (!reserve(world, actor, actor.floorId, anchorId)) {
    return false;
  }
  actor.home = { floorId: actor.floorId, anchorId };
  return true;
}

type Occupancy = { standing: Map<number, number>; claimed: Map<number, number> };

const NO_CELL = -1;

const bump = (counts: Map<number, number>, at: Point): void => {
  const k = key(at);
  counts.set(k, (counts.get(k) ?? 0) + 1);
};

const occupancyOf = (world: World): Map<string, Occupancy> => {
  const floors = new Map<string, Occupancy>();
  for (const actor of world.actors.values()) {
    if (actor.hidden) {
      continue;
    }
    const floor: Occupancy = floors.get(actor.floorId) ?? {
      standing: new Map<number, number>(),
      claimed: new Map<number, number>(),
    };
    floors.set(actor.floorId, floor);
    if (actor.activity === "walk") {
      bump(floor.claimed, actor.tile);
      if (actor.moving !== null) {
        bump(floor.claimed, actor.moving);
      }
    } else {
      bump(floor.standing, actor.tile);
    }
  }
  return floors;
};

export type OccupancyIndex = () => Map<string, Occupancy>;

export const lazyOccupancy = (world: World): OccupancyIndex => {
  let built: Map<string, Occupancy> | null = null;
  return () => {
    built ??= occupancyOf(world);
    return built;
  };
};

const without = (counts: Map<number, number>, at: number, own: number, alsoOwn: number): number =>
  (counts.get(at) ?? 0) - (own === at ? 1 : 0) - (alsoOwn === at ? 1 : 0);

export const occupied = (
  index: OccupancyIndex,
  self: Actor,
  includeMoving = false,
): ((p: Point) => boolean) => {
  const floor = index().get(self.floorId);
  if (floor === undefined) {
    return () => false;
  }
  const walking = self.activity === "walk";
  const ownTile = key(self.tile);
  const standingTile = walking ? NO_CELL : ownTile;
  const claimedTile = walking ? ownTile : NO_CELL;
  const claimedNext = walking && self.moving !== null ? key(self.moving) : NO_CELL;
  return (p) => {
    const at = key(p);
    if (without(floor.standing, at, standingTile, NO_CELL) > 0) {
      return true;
    }
    return includeMoving && without(floor.claimed, at, claimedTile, claimedNext) > 0;
  };
};

export function nearestWalkable(world: World, floorId: string, target: Point): Point {
  const floor = world.floors.get(floorId);
  if (floor === undefined || floor.grid.isWalkable(target)) {
    return target;
  }
  for (let radius = 1; radius < 6; radius += 1) {
    const ring: Point[] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
          ring.push({ x: target.x + dx, y: target.y + dy });
        }
      }
    }
    const [nearest] = ring
      .filter((p) => floor.grid.isWalkable(p))
      .toSorted((a, b) => manhattan(a, target) - manhattan(b, target));
    if (nearest !== undefined) {
      return nearest;
    }
  }
  return target;
}

export const walkSteps = (floorId: string, to: Point): Step[] => [
  { kind: "walk", floorId, to, path: null },
];

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

export function homeSteps(world: World, actor: Actor): Step[] {
  if (actor.home === null) {
    const spot = world.rng.pick(freeAnchors(world, actor.floorId, "wander", actor.kind));
    return spot === undefined ? [] : walkSteps(actor.floorId, spot.at);
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
};

export const pendingDeliveries = (actor: Actor): Step[] => {
  const index = actor.steps.findLastIndex(
    (step) => step.kind === "emit" && step.event.kind === "delivered",
  );
  return index === -1 ? [] : actor.steps.slice(0, index + 1);
};
