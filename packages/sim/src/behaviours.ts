import {
  type Actor,
  type Activity,
  freeAnchors,
  LOBBY_ANCHORS_FLOOR,
  NEEDS,
  type NeedKind,
  reserve,
  setSteps,
  walkSteps,
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
  relax: { activity: "relax", ms: 12000, anchor: "relax" },
};

/** Utility-style idle behaviour: satisfy the most pressing need, otherwise wander or stand around. */
export function idleBehaviour(world: World, actor: Actor): void {
  if (actor.work !== null) {
    return;
  }
  const pressing = NEEDS.filter((n) => actor.needs[n] >= THRESHOLD).toSorted(
    (a, b) => actor.needs[b] - actor.needs[a],
  )[0];
  if (pressing !== undefined && world.rng.chance(0.7)) {
    const plan = DWELL[pressing];
    const candidates = [actor.floorId, LOBBY_ANCHORS_FLOOR].flatMap((floorId) =>
      freeAnchors(world, floorId, plan.anchor).map((anchor) => ({ floorId, anchor })),
    );
    const pick = world.rng.pick(candidates);
    if (pick !== undefined && reserve(world, actor, pick.floorId, pick.anchor.id)) {
      actor.needs[pressing] = 0;
      setSteps(actor, [
        ...walkSteps(world, actor, pick.floorId, pick.anchor.at),
        {
          kind: "dwell",
          activity: plan.activity,
          facing: pick.anchor.facing,
          until: null,
          ms: plan.ms,
        },
        { kind: "emit", event: { kind: "arrived", agentId: actor.id, anchorId: pick.anchor.id } },
      ]);
      actor.idleUntil = world.time + plan.ms;
      return;
    }
  }
  if (world.rng.chance(0.55)) {
    actor.idleUntil = world.time + 2500 + world.rng.int(5000);
    actor.activity = "idle";
    return;
  }
  const spots = freeAnchors(world, actor.floorId, "wander");
  const spot = world.rng.pick(spots);
  if (spot !== undefined) {
    setSteps(actor, walkSteps(world, actor, actor.floorId, spot.at));
  }
  actor.idleUntil = world.time + 3000;
}
