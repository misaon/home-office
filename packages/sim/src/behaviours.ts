import { manhattan } from "./grid.ts";
import { homeSteps, setSteps, walkSteps } from "./actors.ts";
import {
  type Actor,
  type Activity,
  anchorOf,
  freeAnchors,
  NEEDS,
  type NeedKind,
  release,
  reserve,
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
const AWAY_CHANCE = 0.06;
const AWAY_MIN_MS = 45_000;
const AWAY_SPAN_MS = 90_000;

const pressingNeed = (actor: Actor, allowed: readonly NeedKind[]): NeedKind | undefined =>
  allowed
    .filter((n) => actor.needs[n] >= THRESHOLD)
    .toSorted((a, b) => actor.needs[b] - actor.needs[a])[0];

function satisfy(world: World, actor: Actor, need: NeedKind): boolean {
  const plan = DWELL[need];
  const options = freeAnchors(world, actor.floorId, plan.anchor, actor.kind);
  const anchor =
    actor.kind === "boss"
      ? options.toSorted((a, b) => manhattan(actor.tile, a.at) - manhattan(actor.tile, b.at))[0]
      : world.rng.pick(options);
  if (anchor === undefined || !reserve(world, actor, actor.floorId, anchor.id)) {
    return false;
  }
  actor.needs[need] = 0;
  setSteps(actor, [
    ...walkSteps(actor.floorId, anchor.at),
    { kind: "dwell", activity: plan.activity, facing: anchor.facing, until: null, ms: plan.ms },
    { kind: "release" },
    ...homeSteps(world, actor),
  ]);
  actor.idleUntil = world.time + plan.ms;
  return true;
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
  if (need !== undefined && world.rng.chance(0.7) && satisfy(world, actor, need)) {
    return;
  }
  const home = homeSteps(world, actor);
  if (home.length > 0) {
    setSteps(actor, home);
  }
  actor.idleUntil = world.time + 5000;
}

function staffIdle(world: World, actor: Actor): void {
  const need = pressingNeed(actor, NEEDS);
  if (need !== undefined && world.rng.chance(0.7) && satisfy(world, actor, need)) {
    return;
  }
  if (
    need === undefined &&
    world.rng.chance(AWAY_CHANCE) &&
    leaveFloor(world, actor, AWAY_MIN_MS + world.rng.int(AWAY_SPAN_MS))
  ) {
    return;
  }
  if (world.rng.chance(0.55)) {
    actor.idleUntil = world.time + 2500 + world.rng.int(5000);
    actor.activity = "idle";
    return;
  }
  const spot = world.rng.pick(freeAnchors(world, actor.floorId, "wander", actor.kind));
  if (spot !== undefined) {
    setSteps(actor, walkSteps(actor.floorId, spot.at));
  }
  actor.idleUntil = world.time + 3000;
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
