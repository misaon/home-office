import { advanceStep } from "./steps.ts";
import {
  type Actor,
  ELEVATOR_DOORS_MS,
  freeAnchors,
  NEED_PERIOD_MS,
  NEEDS,
  setSteps,
  walkSteps,
  type World,
} from "./world.ts";

/** Pause on the elevator threshold before walking off, and the gap between cars (doors close in between). */
const STEP_OUT_MS = 400;
const ARRIVAL_GAP_MS = 2200;

/**
 * One elevator car per arrival: call it (doors open for ELEVATOR_DOORS_MS), let the first waiting actor step onto
 * the threshold, pause, then walk off — to their work when it is already assigned, otherwise to a free corridor
 * spot — so the doors can close before the next car. Proximity keeps the doors open while they stand there.
 */
function arrive(world: World): void {
  const a = world.arrivals;
  const next = a.queue[0];
  if (next === undefined || world.time < a.nextAt) {
    return;
  }
  if (a.carAt === 0) {
    a.carAt = world.time + ELEVATOR_DOORS_MS;
    world.held.add("elevator");
    return;
  }
  if (world.time < a.carAt) {
    return;
  }
  a.queue.shift();
  a.carAt = 0;
  a.nextAt = world.time + ARRIVAL_GAP_MS;
  world.held.delete("elevator");
  const actor = world.actors.get(next);
  if (actor === undefined) {
    return;
  }
  actor.hidden = false;
  actor.facing = "s";
  const spot = world.rng.pick(freeAnchors(world, actor.floorId, "wander"))?.at ?? {
    x: actor.tile.x,
    y: actor.tile.y + 2,
  };
  setSteps(actor, [
    { kind: "dwell", activity: "idle", facing: "s", until: null, ms: STEP_OUT_MS },
    ...(actor.steps.length > 0 ? actor.steps : walkSteps(world, actor, actor.floorId, spot)),
  ]);
}

export function tick(
  world: World,
  dtMs: number,
  onIdle: (world: World, actor: Actor) => void,
): void {
  world.time += dtMs;
  arrive(world);
  for (const actor of world.actors.values()) {
    if (actor.hidden && world.arrivals.queue.includes(actor.id)) {
      // Still in the elevator car.
      continue;
    }
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
