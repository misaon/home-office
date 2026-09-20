import type { AgentId, AgentRole, RuntimeEvent } from "@ho/protocol";
import {
  homeSteps,
  pendingDeliveries,
  resumeSteps,
  setSteps,
  summon,
  walkSteps,
} from "./actors.ts";
import { facingTowards, neighboursOf, type Point } from "./grid.ts";
import type { Anchor } from "./map.ts";
import {
  type Actor,
  anchorOf,
  type DeliveryRef,
  type Emotion,
  freeAnchors,
  release,
  reserve,
  type Step,
  type World,
} from "./world.ts";

const HANDOVER_MS = 1200;
const CELEBRATE_MS = 1800;
const RECEIVED_BUBBLE_MS = 3000;

const SEAT_GROUP: Partial<Record<AgentRole, string>> = {
  backend: "dev",
  frontend: "dev",
  devops: "dev",
  developer: "dev",
  security: "dev",
  qa: "qa",
  analyst: "analyst",
  head: "analyst",
};

export function freeDeskFor(
  world: World,
  floorId: string,
  role: AgentRole,
  kind: Actor["kind"],
): Anchor | undefined {
  const desks = freeAnchors(world, floorId, "desk", kind);
  const group = SEAT_GROUP[role];
  return (
    world.rng.pick(desks.filter((a) => a.group === group)) ??
    world.rng.pick(desks.filter((a) => a.group === "dev")) ??
    world.rng.pick(desks)
  );
}

function seatFor(world: World, actor: Actor, role: AgentRole): Anchor | undefined {
  const own = actor.home === null ? undefined : anchorOf(world, actor.floorId, actor.home.anchorId);
  if (role === "boss" || actor.kind === "receptionist") {
    const desk =
      own ??
      (role === "boss"
        ? world.rng.pick(freeAnchors(world, actor.floorId, "boss-desk", "boss"))
        : undefined);
    if (desk !== undefined) {
      return desk;
    }
  }
  if (own?.kind === "desk") {
    return own;
  }
  return freeDeskFor(world, actor.floorId, role, actor.kind);
}

export function assignWork(
  world: World,
  agentId: AgentId,
  floorId: string,
  role: AgentRole,
): boolean {
  const actor = world.actors.get(agentId);
  if (actor === undefined || actor.floorId !== floorId) {
    return false;
  }
  summon(world, actor);
  if (actor.work !== null) {
    return true;
  }
  const anchor = seatFor(world, actor, role);
  if (anchor === undefined || !reserve(world, actor, floorId, anchor.id)) {
    return false;
  }
  actor.work = { floorId, anchorId: anchor.id };
  setSteps(actor, [
    ...pendingDeliveries(actor),
    ...walkSteps(floorId, anchor.at),
    { kind: "hold", activity: "type", facing: anchor.facing },
  ]);
  return true;
}

export function releaseWork(world: World, agentId: AgentId, ok: boolean): void {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return;
  }
  actor.work = null;
  release(world, actor);
  const celebrate: Step[] = ok
    ? [{ kind: "dwell", activity: "celebrate", facing: "s", until: null, ms: CELEBRATE_MS }]
    : [];
  setSteps(actor, [...pendingDeliveries(actor), ...celebrate, ...homeSteps(world, actor)]);
  actor.idleUntil = world.time + CELEBRATE_MS;
}

const adjacentFree = (world: World, floorId: string, at: Point, fallback: Point): Point => {
  const floor = world.floors.get(floorId);
  return neighboursOf(at).find((p) => floor?.grid.isWalkable(p) === true) ?? fallback;
};

const meetingPoint = (world: World, source: Actor, target: Actor): Point => {
  if (!target.hidden) {
    return adjacentFree(world, target.floorId, target.tile, source.tile);
  }
  const place = target.work ?? target.home;
  const spot =
    (place === null ? undefined : anchorOf(world, target.floorId, place.anchorId)) ??
    anchorOf(world, target.floorId, "entrance");
  return spot === undefined
    ? source.tile
    : adjacentFree(world, source.floorId, spot.at, source.tile);
};

export function carry(
  world: World,
  from: AgentId,
  to: AgentId,
  ref: DeliveryRef,
  before: readonly Step[] = [],
): boolean {
  const source = world.actors.get(from);
  const target = world.actors.get(to);
  if (source === undefined || target === undefined || source.floorId !== target.floorId) {
    return false;
  }
  summon(world, source);
  summon(world, target);
  release(world, source);
  const meet = meetingPoint(world, source, target);
  const face = facingTowards(meet, target.hidden ? meet : target.tile);
  setEmotion(world, from, "envelope", null);
  setSteps(source, [
    ...pendingDeliveries(source),
    ...before,
    ...walkSteps(target.floorId, meet),
    { kind: "dwell", activity: "handover", facing: face, until: null, ms: HANDOVER_MS },
    { kind: "emit", event: { kind: "delivered", ref, by: from, to } },
    ...resumeSteps(world, source),
  ]);
  return true;
}

export function receive(world: World, agentId: AgentId, from: AgentId): void {
  const actor = world.actors.get(agentId);
  const source = world.actors.get(from);
  setEmotion(world, from, null, null);
  if (actor === undefined || source === undefined || actor.hidden || agentId === from) {
    return;
  }
  setEmotion(world, agentId, "envelope", RECEIVED_BUBBLE_MS);
  release(world, actor);
  setSteps(actor, [
    ...pendingDeliveries(actor),
    {
      kind: "dwell",
      activity: "receive",
      facing: facingTowards(actor.tile, source.tile),
      until: null,
      ms: HANDOVER_MS,
    },
    ...resumeSteps(world, actor),
  ]);
}

export function sleep(world: World, agentId: AgentId): void {
  const actor = world.actors.get(agentId);
  if (actor === undefined) {
    return;
  }
  const bed = world.rng.pick(freeAnchors(world, actor.floorId, "sleep", actor.kind));
  const spot = bed ?? world.rng.pick(freeAnchors(world, actor.floorId, "wander", actor.kind));
  actor.work = null;
  release(world, actor);
  if (bed !== undefined) {
    reserve(world, actor, actor.floorId, bed.id);
  }
  setSteps(actor, [
    ...pendingDeliveries(actor),
    ...(spot === undefined ? [] : walkSteps(actor.floorId, spot.at)),
    { kind: "hold", activity: "sleep", facing: spot?.facing ?? "s" },
  ]);
}

export function wake(world: World, agentId: AgentId): void {
  const actor = world.actors.get(agentId);
  if (actor?.activity === "sleep") {
    release(world, actor);
    setSteps(actor, pendingDeliveries(actor));
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

type EmotionCue = { kind: Emotion; ttlMs: number | null };

const STATIC_CUES: Partial<Record<RuntimeEvent["kind"], EmotionCue>> = {
  tool_call: { kind: "focused", ttlMs: 8000 },
  error: { kind: "frustrated", ttlMs: 20_000 },
  permission_request: { kind: "question", ttlMs: null },
  rate_limited: { kind: "sleepy", ttlMs: null },
};

export function emotionFor(event: RuntimeEvent): EmotionCue | null {
  if (event.kind === "tool_result") {
    return event.ok ? null : { kind: "frustrated", ttlMs: 6000 };
  }
  if (event.kind === "result") {
    return event.ok ? { kind: "happy", ttlMs: 6000 } : { kind: "frustrated", ttlMs: 10_000 };
  }
  return STATIC_CUES[event.kind] ?? null;
}
