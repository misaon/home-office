import { manhattan, samePoint } from "./grid.ts";
import { homeSteps, resumeSteps, setSteps, walkSteps } from "./actors.ts";
import {
  type Actor,
  type Activity,
  anchorOf,
  freeAnchors,
  NEEDS,
  type NeedKind,
  release,
  reserve,
  type Step,
  type World,
} from "./world.ts";

const THRESHOLD = 0.6;
const DWELL: Record<
  NeedKind,
  { activity: Activity; ms: number; anchor: "coffee" | "restroom" | "smoke" | "relax" }
> = {
  coffee: { activity: "drink", ms: 7000, anchor: "coffee" },
  restroom: { activity: "restroom", ms: 6000, anchor: "restroom" },
  smoke: { activity: "smoke", ms: 9000, anchor: "smoke" },
  relax: { activity: "relax", ms: 12_000, anchor: "relax" },
};
const BOSS_NEEDS: readonly NeedKind[] = ["coffee", "restroom"];
const AWAY_CHANCE = 0.03;
const AWAY_MIN_MS = 45_000;
const AWAY_SPAN_MS = 90_000;

const RESET_SPREAD = 0.3;

const pressingNeed = (
  actor: Actor,
  allowed: readonly NeedKind[],
  threshold = THRESHOLD,
): NeedKind | undefined =>
  allowed
    .filter((n) => actor.needs[n] >= threshold)
    .toSorted((a, b) => actor.needs[b] - actor.needs[a])[0];

function satisfy(world: World, actor: Actor, need: NeedKind, after: readonly Step[]): boolean {
  const plan = DWELL[need];
  const options = freeAnchors(world, actor.floorId, plan.anchor, actor.kind);
  const anchor =
    actor.kind === "boss"
      ? options.toSorted((a, b) => manhattan(actor.tile, a.at) - manhattan(actor.tile, b.at))[0]
      : world.rng.pick(options);
  if (anchor === undefined || !reserve(world, actor, actor.floorId, anchor.id)) {
    return false;
  }
  actor.needs[need] = world.rng.next() * RESET_SPREAD;
  setSteps(actor, [
    ...walkSteps(actor.floorId, anchor.at),
    { kind: "dwell", activity: plan.activity, facing: anchor.facing, until: null, ms: plan.ms },
    { kind: "release" },
    ...after,
  ]);
  actor.idleUntil = world.time + plan.ms;
  return true;
}

const BREAK_NEEDS: readonly NeedKind[] = ["restroom"];
const BREAK_THRESHOLD = 0.95;
const BREAK_CHANCE = 0.5;
const BREAK_CHECK_MS = 15_000;

export function breakBehaviour(world: World, actor: Actor): void {
  const [step] = actor.steps;
  if (
    actor.work === null ||
    actor.meeting !== null ||
    step?.kind !== "hold" ||
    actor.steps.length !== 1 ||
    world.time < actor.idleUntil
  ) {
    return;
  }
  const need = pressingNeed(actor, BREAK_NEEDS, BREAK_THRESHOLD);
  if (
    need !== undefined &&
    world.rng.chance(BREAK_CHANCE) &&
    satisfy(world, actor, need, resumeSteps(world, actor))
  ) {
    return;
  }
  actor.idleUntil = world.time + BREAK_CHECK_MS;
}

function leaveFloor(world: World, actor: Actor, ms: number): boolean {
  const car = anchorOf(world, actor.floorId, "car");
  if (car === undefined) {
    return false;
  }
  release(world, actor);
  setSteps(actor, [...walkSteps(actor.floorId, car.at), { kind: "away", ms }]);
  return true;
}

function bossIdle(world: World, actor: Actor): void {
  const need = pressingNeed(actor, BOSS_NEEDS);
  if (
    need !== undefined &&
    world.rng.chance(0.7) &&
    satisfy(world, actor, need, homeSteps(world, actor))
  ) {
    return;
  }
  const home = homeSteps(world, actor);
  if (home.length > 0) {
    setSteps(actor, home);
  }
  actor.idleUntil = world.time + 5000;
}

const WANDER_CHANCE = 0.35;
const WANDER_MIN_MS = 8000;
const WANDER_SPAN_MS = 12_000;
const DESK_IDLE_MIN_MS = 8000;
const DESK_IDLE_SPAN_MS = 14_000;

function wander(world: World, actor: Actor): boolean {
  const spot = world.rng.pick(freeAnchors(world, actor.floorId, "wander", actor.kind));
  if (spot === undefined || !reserve(world, actor, actor.floorId, spot.id)) {
    return false;
  }
  const ms = WANDER_MIN_MS + world.rng.int(WANDER_SPAN_MS);
  setSteps(actor, [
    ...walkSteps(actor.floorId, spot.at),
    { kind: "dwell", activity: "idle", facing: spot.facing, until: null, ms },
    { kind: "release" },
    ...homeSteps(world, actor),
  ]);
  actor.idleUntil = world.time + ms;
  return true;
}

function staffIdle(world: World, actor: Actor): void {
  const need = pressingNeed(actor, NEEDS);
  if (
    need !== undefined &&
    world.rng.chance(0.7) &&
    satisfy(world, actor, need, homeSteps(world, actor))
  ) {
    return;
  }
  if (
    need === undefined &&
    world.rng.chance(AWAY_CHANCE) &&
    leaveFloor(world, actor, AWAY_MIN_MS + world.rng.int(AWAY_SPAN_MS))
  ) {
    return;
  }
  const home =
    actor.home === null ? undefined : anchorOf(world, actor.floorId, actor.home.anchorId);
  if (home !== undefined && !samePoint(actor.tile, home.at)) {
    setSteps(actor, homeSteps(world, actor));
    actor.idleUntil = world.time + 3000;
    return;
  }
  if ((home === undefined || world.rng.chance(WANDER_CHANCE)) && wander(world, actor)) {
    return;
  }
  actor.activity = "idle";
  if (home !== undefined) {
    actor.facing = home.facing;
  }
  actor.idleUntil = world.time + DESK_IDLE_MIN_MS + world.rng.int(DESK_IDLE_SPAN_MS);
}

export function idleBehaviour(world: World, actor: Actor): void {
  if (actor.work !== null || actor.kind === "visitor" || actor.kind === "receptionist") {
    return;
  }
  if (actor.kind === "boss") {
    bossIdle(world, actor);
    return;
  }
  staffIdle(world, actor);
}
