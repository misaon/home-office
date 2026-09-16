import { facingTowards, findPath, neighboursOf, samePoint } from "./grid.ts";
import { nearestWalkable, type OccupancyIndex, occupied } from "./actors.ts";
import { type Actor, release, speedOf, type Step, type World } from "./world.ts";

const finishStep = (actor: Actor): void => {
  actor.steps.shift();
  actor.moving = null;
};

const BLOCKED_WAIT_MS = 500;
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
  if (actor.moving === null && occupied(occupancy, actor, true)(next)) {
    step.blockedMs = (step.blockedMs ?? 0) + dtMs;
    actor.activity = "idle";
    actor.facing = facingTowards(actor.tile, next);
    if (step.blockedMs >= BLOCKED_WAIT_MS + actor.detourJitterMs) {
      step.blockedMs = 0;
      const target = nearestWalkable(world, actor.floorId, step.to);
      const around = occupied(occupancy, actor, true);
      const detour = findPath(floor.grid, actor.tile, target, around);
      if (detour.length > 0) {
        step.path = detour;
        return;
      }
      const aside = neighboursOf(actor.tile).find(
        (p) => floor.grid.isWalkable(p) && !around(p) && !samePoint(p, next),
      );
      if (aside !== undefined) {
        step.path = [aside];
        step.replan = true;
      }
    }
    return;
  }
  actor.moving = next;
  actor.activity = "walk";
  actor.facing = facingTowards(actor.tile, next);
  const distance = (speedOf(actor) * dtMs) / 1000;
  const dx = next.x - actor.pos.x;
  const dy = next.y - actor.pos.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= distance) {
    actor.pos = { x: next.x, y: next.y };
    actor.tile = { x: next.x, y: next.y };
    actor.moving = null;
    step.path.shift();
    if (step.path.length === 0) {
      if (step.replan === true) {
        step.replan = false;
        step.path = null;
      } else {
        finishStep(actor);
      }
    }
    return;
  }
  actor.pos = {
    x: actor.pos.x + (dx / remaining) * distance,
    y: actor.pos.y + (dy / remaining) * distance,
  };
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
