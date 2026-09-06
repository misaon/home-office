import type { AgentId } from "@ho/protocol";
import { facingTowards, type Point } from "./grid.ts";
import {
  type Actor,
  type Emotion,
  freeAnchors,
  release,
  reserve,
  setSteps,
  walkSteps,
  type World,
} from "./world.ts";

const HANDOVER_MS = 1200;
const CELEBRATE_MS = 1800;

/** Send an agent to a free desk on a floor (the boss desk in the Lobby) and keep it typing there. */
export function assignWork(
  world: World,
  agentId: AgentId,
  floorId: string,
  kind: "desk" | "boss-desk" = "desk",
): boolean {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return false;
  }
  if (actor.work !== null && actor.work.floorId === floorId) {
    return true;
  }
  const anchor =
    world.rng.pick(freeAnchors(world, floorId, kind)) ??
    world.rng.pick(freeAnchors(world, floorId, "desk"));
  if (anchor === undefined || !reserve(world, actor, floorId, anchor.id)) {
    return false;
  }
  actor.work = { floorId, anchorId: anchor.id };
  setSteps(actor, [
    ...walkSteps(world, actor, floorId, anchor.at),
    { kind: "hold", activity: "type", facing: anchor.facing },
  ]);
  return true;
}

/** Work ended: celebrate on success, then go idle. */
export function releaseWork(world: World, agentId: AgentId, ok: boolean): void {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return;
  }
  actor.work = null;
  release(world, actor);
  setSteps(
    actor,
    ok
      ? [{ kind: "dwell", activity: "celebrate", facing: "s", until: null, ms: CELEBRATE_MS }]
      : [],
  );
  actor.idleUntil = world.time + CELEBRATE_MS;
}

const adjacentFree = (world: World, actor: Actor, target: Actor): Point => {
  const floor = world.floors.get(target.floorId);
  const options: Point[] = [
    { x: target.tile.x - 1, y: target.tile.y },
    { x: target.tile.x + 1, y: target.tile.y },
    { x: target.tile.x, y: target.tile.y + 1 },
    { x: target.tile.x, y: target.tile.y - 1 },
  ];
  return options.find((p) => floor?.grid.isWalkable(p) === true) ?? actor.tile;
};

/**
 * `from` walks to `to` (taking the elevator when needed), hands the folder over, and the sim emits
 * `handoff_delivered` so the daemon can start the recipient's session.
 */
export function handoff(world: World, from: AgentId, to: AgentId): boolean {
  const source = world.actors.get(from);
  const target = world.actors.get(to);
  if (source === undefined || target === undefined) {
    return false;
  }
  const meet = adjacentFree(world, source, target);
  const face = facingTowards(meet, target.tile);
  source.work = null;
  release(world, source);
  setSteps(source, [
    ...walkSteps(world, source, target.floorId, meet),
    { kind: "dwell", activity: "handover", facing: face, until: null, ms: HANDOVER_MS },
    { kind: "emit", event: { kind: "handoff_delivered", from, to } },
  ]);
  return true;
}

/** The recipient turns to receive the folder (called by the host when the source arrives, or on delivery). */
export function receive(world: World, agentId: AgentId, from: AgentId): void {
  const actor = world.actors.get(agentId);
  const source = world.actors.get(from);
  if (actor === undefined || source === undefined || actor.work !== null) {
    return;
  }
  setSteps(actor, [
    {
      kind: "dwell",
      activity: "receive",
      facing: facingTowards(actor.tile, source.tile),
      until: null,
      ms: HANDOVER_MS,
    },
  ]);
}

/** Rate limited or off hours: find a sleeping spot and stay there until woken. */
export function sleep(world: World, agentId: AgentId): void {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return;
  }
  const spot = world.rng.pick([
    ...freeAnchors(world, actor.floorId, "sleep"),
    ...freeAnchors(world, "lobby", "sleep"),
  ]);
  actor.work = null;
  release(world, actor);
  if (spot === undefined) {
    setSteps(actor, [{ kind: "hold", activity: "sleep", facing: "s" }]);
    return;
  }
  reserve(
    world,
    actor,
    spot.kind === "sleep" && freeAnchors(world, actor.floorId, "sleep").includes(spot)
      ? actor.floorId
      : "lobby",
    spot.id,
  );
  setSteps(actor, [
    ...walkSteps(world, actor, actor.reservation?.floorId ?? actor.floorId, spot.at),
    { kind: "hold", activity: "sleep", facing: spot.facing },
  ]);
}

export function wake(world: World, agentId: AgentId): void {
  const actor = world.actors.get(agentId);
  if (actor !== undefined && actor.activity === "sleep") {
    release(world, actor);
    setSteps(actor, []);
    actor.activity = "idle";
    actor.idleUntil = world.time;
  }
}

export function setEmotion(
  world: World,
  agentId: AgentId,
  kind: Emotion | null,
  ttlMs: number | null,
): void {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return;
  }
  actor.emotion =
    kind === null ? null : { kind, until: ttlMs === null ? null : world.time + ttlMs };
}
