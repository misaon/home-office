/** Advances the world by `dtMs`. Idle decisions are made by the behaviour module through `onIdle`. */
import type { Point } from "./grid.ts";
import { advanceStep } from "./steps.ts";
import { lazyOccupancy, setSteps, walkSteps } from "./actors.ts";
import {
  type Actor,
  anchorOf,
  ELEVATOR_DOORS_MS,
  type Floor,
  freeAnchors,
  NEED_PERIOD_MS,
  NEEDS,
  type World,
} from "./world.ts";

/** Pause on the threshold before walking off, and the pause with closed doors before the next car. */
const STEP_OUT_MS = 300;
const CAR_GAP_MS = 600;
const DOORS_KEY = "elevator-doors";
/** The boss keeps to his office: his needs build up this many times slower than the staff's. */
const BOSS_NEED_SLOWDOWN = 4;

/** The car interior and its threshold: while anybody visible stands here, the doors stay open. */
const inCarZone = (actor: Actor, car: Point): boolean =>
  !actor.hidden &&
  Math.abs(actor.tile.x - car.x) <= 3 &&
  actor.tile.y >= car.y - 1 &&
  actor.tile.y <= car.y + 4;

/** Advances one floor's elevator doors and delivers one queued passenger per car (see `Elevator`). */
function runElevator(world: World, floorId: string, floor: Floor, dtMs: number): void {
  const e = floor.elevator;
  const car = anchorOf(world, floorId, "car")?.at;
  if (car === undefined) {
    return;
  }
  const occupied = [...world.actors.values()].some(
    (a) => a.floorId === floorId && inCarZone(a, car),
  );
  switch (e.phase) {
    case "closed": {
      const next = e.queue[0];
      if (next !== undefined && world.time >= e.nextAt) {
        // The car arrives: the passenger stands behind the closed doors and shows through as they part.
        const passenger = world.actors.get(next);
        if (passenger !== undefined) {
          passenger.hidden = false;
          passenger.facing = "s";
          passenger.pos = { ...car };
          passenger.tile = { ...car };
        }
        e.passenger = next;
        e.phase = "opening";
      } else if (occupied) {
        // Somebody walked up to the car from the office (a visitor leaving, staff off for a while).
        e.phase = "opening";
      }
      break;
    }
    case "opening": {
      e.amount = Math.min(1, e.amount + dtMs / ELEVATOR_DOORS_MS);
      if (e.amount === 1) {
        e.phase = "open";
        const passenger = e.passenger === null ? undefined : world.actors.get(e.passenger);
        e.queue = e.queue.filter((id) => id !== e.passenger);
        e.passenger = null;
        if (passenger !== undefined) {
          const spot = world.rng.pick(freeAnchors(world, floorId, "wander", passenger.kind))
            ?.at ?? { x: car.x, y: car.y + 5 };
          setSteps(passenger, [
            { kind: "dwell", activity: "idle", facing: "s", until: null, ms: STEP_OUT_MS },
            ...(passenger.steps.length > 0 ? passenger.steps : walkSteps(floorId, spot)),
          ]);
        }
      }
      break;
    }
    case "open": {
      if (!occupied) {
        e.phase = "closing";
      }
      break;
    }
    case "closing": {
      e.amount = Math.max(0, e.amount - dtMs / ELEVATOR_DOORS_MS);
      if (e.amount === 0) {
        e.phase = "closed";
        e.nextAt = world.time + CAR_GAP_MS;
      }
      break;
    }
  }
  floor.animations.set(DOORS_KEY, e.amount);
}

export function tick(
  world: World,
  dtMs: number,
  onIdle: (world: World, actor: Actor) => void,
): void {
  world.time += dtMs;
  for (const [floorId, floor] of world.floors) {
    runElevator(world, floorId, floor, dtMs);
  }
  const occupancy = lazyOccupancy(world);
  for (const actor of world.actors.values()) {
    const elevator = world.floors.get(actor.floorId)?.elevator;
    if (elevator === undefined || elevator.queue.includes(actor.id)) {
      // Waiting in the elevator car (hidden, or standing behind the doors as they open).
      continue;
    }
    if (actor.hidden) {
      // Off the floor: the car brings them back when their time is up (or when somebody summons them).
      if (actor.awayUntil !== null && world.time >= actor.awayUntil) {
        actor.awayUntil = null;
        elevator.queue.push(actor.id);
      }
      continue;
    }
    actor.animTime += dtMs;
    const slowdown = actor.kind === "boss" ? BOSS_NEED_SLOWDOWN : 1;
    for (const need of NEEDS) {
      actor.needs[need] = Math.min(1, actor.needs[need] + dtMs / (NEED_PERIOD_MS[need] * slowdown));
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
    advanceStep(world, actor, dtMs, occupancy);
  }
}
