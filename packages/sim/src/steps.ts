import { facingTowards, findPath } from "./grid.ts";
import {
  type Actor,
  anchorOf,
  ELEVATOR_MS,
  nearestWalkable,
  occupied,
  SPEED_TILES_PER_S,
  type Step,
  type World,
} from "./world.ts";

const finishStep = (actor: Actor): void => {
  actor.steps.shift();
  actor.animTime = 0;
};

function advanceWalk(
  world: World,
  actor: Actor,
  step: Extract<Step, { kind: "walk" }>,
  dtMs: number,
): void {
  const floor = world.floors.get(actor.floorId);
  if (floor === undefined || step.floorId !== actor.floorId) {
    finishStep(actor);
    return;
  }
  if (step.path === null) {
    const target = nearestWalkable(world, actor.floorId, step.to);
    step.path = findPath(floor.grid, actor.tile, target, occupied(world, actor));
    if (step.path.length === 0) {
      finishStep(actor);
      return;
    }
  }
  const next = step.path[0];
  if (next === undefined) {
    actor.pos = { ...actor.tile };
    finishStep(actor);
    return;
  }
  actor.activity = "walk";
  actor.facing = facingTowards(actor.tile, next);
  const distance = (SPEED_TILES_PER_S * dtMs) / 1000;
  const dx = next.x - actor.pos.x;
  const dy = next.y - actor.pos.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= distance) {
    actor.pos = { x: next.x, y: next.y };
    actor.tile = { x: next.x, y: next.y };
    step.path.shift();
    if (step.path.length === 0) {
      finishStep(actor);
    }
    return;
  }
  actor.pos = {
    x: actor.pos.x + (dx / remaining) * distance,
    y: actor.pos.y + (dy / remaining) * distance,
  };
}

export function advanceStep(world: World, actor: Actor, dtMs: number): void {
  const step = actor.steps[0];
  if (step === undefined) {
    return;
  }
  switch (step.kind) {
    case "walk": {
      advanceWalk(world, actor, step, dtMs);
      return;
    }
    case "elevator": {
      if (step.until === null) {
        step.until = world.time + ELEVATOR_MS;
        actor.hidden = true;
        actor.activity = "idle";
        return;
      }
      if (world.time >= step.until) {
        const target = world.floors.get(step.toFloorId);
        const lift = target === undefined ? undefined : anchorOf(world, step.toFloorId, "elevator");
        if (target !== undefined) {
          actor.floorId = step.toFloorId;
          const at = nearestWalkable(world, step.toFloorId, lift?.at ?? { x: 3, y: 10 });
          actor.pos = { ...at };
          actor.tile = { ...at };
        }
        actor.hidden = false;
        finishStep(actor);
      }
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
    case "emit": {
      world.outbox.push(step.event);
      finishStep(actor);
    }
  }
}

/** Advances the world by `dtMs`. Idle decisions are made by the behaviour module through `onIdle`. */
