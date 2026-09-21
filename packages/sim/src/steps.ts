import { facingTowards, findPath, neighboursOf, type Point, samePoint } from "./grid.ts";
import { nearestWalkable, type OccupancyIndex, occupied } from "./actors.ts";
import { type Actor, type Floor, release, speedOf, type Step, type World } from "./world.ts";

const finishStep = (actor: Actor): void => {
  actor.steps.shift();
  actor.moving = null;
};

const BLOCKED_WAIT_MS = 500;
const YIELD_MS = 1500;
const PUSH_THROUGH_MS = 4000;
const RETRIES_MAX = 3;

const wantsTile = (other: Actor, tile: Point): boolean => {
  const [step] = other.steps;
  const next = other.moving ?? (step?.kind === "walk" ? step.path?.[0] : undefined);
  return next !== undefined && samePoint(next, tile);
};

const standingAt = (world: World, actor: Actor, tile: Point): Actor | undefined =>
  [...world.actors.values()].find(
    (other) =>
      other.id !== actor.id &&
      other.floorId === actor.floorId &&
      !other.hidden &&
      samePoint(other.tile, tile),
  );

const sidestep = (
  floor: Floor,
  from: Point,
  next: Point,
  around: (p: Point) => boolean,
  allowBehind: boolean,
): Point | undefined => {
  const behind = { x: from.x - (next.x - from.x), y: from.y - (next.y - from.y) };
  const free = neighboursOf(from).filter(
    (p) => floor.grid.isWalkable(p) && !around(p) && !samePoint(p, next),
  );
  return free.find((p) => !samePoint(p, behind)) ?? (allowBehind ? free[0] : undefined);
};

const retried = (step: Extract<Step, { kind: "walk" }>): void => {
  step.retries = (step.retries ?? 0) + 1;
  step.blockedMs = 0;
};

function whileBlocked(
  world: World,
  actor: Actor,
  step: Extract<Step, { kind: "walk" }>,
  next: Point,
  dtMs: number,
  occupancy: OccupancyIndex,
  floor: Floor,
): "wait" | "push" {
  step.blockedMs = (step.blockedMs ?? 0) + dtMs;
  step.stuckMs = (step.stuckMs ?? 0) + dtMs;
  actor.activity = "idle";
  actor.facing = facingTowards(actor.tile, next);
  if (step.stuckMs >= PUSH_THROUGH_MS || (step.retries ?? 0) >= RETRIES_MAX) {
    step.stuckMs = 0;
    step.blockedMs = 0;
    step.retries = 0;
    return "push";
  }
  const around = occupied(occupancy, actor, true);
  const opposite = standingAt(world, actor, next);
  if (opposite !== undefined && wantsTile(opposite, actor.tile) && actor.id < opposite.id) {
    const aside = sidestep(floor, actor.tile, next, around, false);
    if (aside !== undefined) {
      step.path = [aside];
      step.replan = true;
      step.yieldUntil = world.time + YIELD_MS;
      retried(step);
      return "push";
    }
  }
  if (step.blockedMs < BLOCKED_WAIT_MS + actor.detourJitterMs) {
    return "wait";
  }
  retried(step);
  const target = nearestWalkable(world, actor.floorId, step.to);
  const detour = findPath(floor.grid, actor.tile, target, around);
  if (detour.length > 0) {
    step.path = detour;
    return "wait";
  }
  const aside = sidestep(floor, actor.tile, next, around, true);
  if (aside !== undefined) {
    step.path = [aside];
    step.replan = true;
  }
  return "wait";
}
function advanceWalk(
  world: World,
  actor: Actor,
  step: Extract<Step, { kind: "walk" }>,
  dtMs: number,
  occupancy: OccupancyIndex,
): void {
  const floor = world.floors.get(actor.floorId);
  if (floor === undefined || step.floorId !== actor.floorId) {
    finishStep(actor);
    return;
  }
  if (step.path === null) {
    if (step.yieldUntil !== undefined && world.time < step.yieldUntil) {
      actor.activity = "idle";
      return;
    }
    step.yieldUntil = undefined;
    const target = nearestWalkable(world, actor.floorId, step.to);
    step.path = findPath(floor.grid, actor.tile, target, occupied(occupancy, actor));
    if (step.path.length === 0) {
      finishStep(actor);
      return;
    }
  }
  const [next] = step.path;
  if (next === undefined) {
    actor.pos = { ...actor.tile };
    finishStep(actor);
    return;
  }
  if (
    actor.moving === null &&
    occupied(occupancy, actor, true)(next) &&
    whileBlocked(world, actor, step, next, dtMs, occupancy, floor) === "wait"
  ) {
    return;
  }
  actor.activity = "walk";
  let budget = (speedOf(actor) * dtMs) / 1000;
  let [ahead] = step.path;
  let pushing = true;
  while (ahead !== undefined) {
    if (!pushing && actor.moving === null && occupied(occupancy, actor, true)(ahead)) {
      actor.facing = facingTowards(actor.tile, ahead);
      return;
    }
    pushing = false;
    actor.moving = ahead;
    actor.facing = facingTowards(actor.tile, ahead);
    const dx = ahead.x - actor.pos.x;
    const dy = ahead.y - actor.pos.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining > budget) {
      actor.pos = {
        x: actor.pos.x + (dx / remaining) * budget,
        y: actor.pos.y + (dy / remaining) * budget,
      };
      return;
    }
    budget -= remaining;
    actor.pos = { x: ahead.x, y: ahead.y };
    actor.tile = { x: ahead.x, y: ahead.y };
    actor.moving = null;
    step.stuckMs = 0;
    step.path.shift();
    if (step.path.length === 0) {
      if (step.replan === true) {
        step.replan = false;
        step.path = null;
      } else {
        finishStep(actor);
      }
      return;
    }
    [ahead] = step.path;
  }
}

export function advanceStep(
  world: World,
  actor: Actor,
  dtMs: number,
  occupancy: OccupancyIndex,
): void {
  const [step] = actor.steps;
  if (step === undefined) {
    return;
  }
  switch (step.kind) {
    case "walk": {
      advanceWalk(world, actor, step, dtMs, occupancy);
      return;
    }
    case "dwell": {
      actor.activity = step.activity;
      if (step.facing !== null) {
        actor.facing = step.facing;
      }
      if (step.until === null) {
        step.until = world.time + step.ms;
      } else if (world.time >= step.until) {
        finishStep(actor);
      }
      return;
    }
    case "hold": {
      actor.activity = step.activity;
      if (step.facing !== null) {
        actor.facing = step.facing;
      }
      return;
    }
    case "away": {
      actor.hidden = true;
      actor.activity = "idle";
      actor.awayUntil = world.time + step.ms;
      release(world, actor);
      finishStep(actor);
      return;
    }
    case "release": {
      release(world, actor);
      finishStep(actor);
      return;
    }
    case "emit": {
      world.outbox.push(step.event);
      finishStep(actor);
    }
  }
}
