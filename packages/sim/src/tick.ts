import { lazyOccupancy, setSteps, walkSteps } from "./actors.ts";
import { idleBehaviour } from "./behaviours.ts";
import type { Point } from "./grid.ts";
import { advanceStep } from "./steps.ts";
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

const STEP_OUT_MS = 300;
const CAR_GAP_MS = 600;
const BOSS_NEED_SLOWDOWN = 4;

const inCarZone = (actor: Actor, car: Point): boolean =>
  !actor.hidden &&
  Math.abs(actor.tile.x - car.x) <= 3 &&
  actor.tile.y >= car.y - 1 &&
  actor.tile.y <= car.y + 4;

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
      const [next] = e.queue;
      if (next !== undefined && world.time >= e.nextAt) {
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
          const leaves = passenger.steps[0]?.kind === "walk";
          setSteps(passenger, [
            { kind: "dwell", activity: "idle", facing: "s", until: null, ms: STEP_OUT_MS },
            ...(leaves ? [] : walkSteps(floorId, spot)),
            ...passenger.steps,
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
}

export function tick(world: World, dtMs: number): void {
  world.time += dtMs;
  for (const [floorId, floor] of world.floors) {
    runElevator(world, floorId, floor, dtMs);
  }
  const occupancy = lazyOccupancy(world);
  for (const actor of world.actors.values()) {
    const elevator = world.floors.get(actor.floorId)?.elevator;
    if (elevator === undefined || elevator.queue.includes(actor.id)) {
      continue;
    }
    if (actor.hidden) {
      if (actor.awayUntil !== null && world.time >= actor.awayUntil) {
        actor.awayUntil = null;
        elevator.queue.push(actor.id);
      }
      continue;
    }
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
        idleBehaviour(world, actor);
      }
    }
    advanceStep(world, actor, dtMs, occupancy);
  }
}
