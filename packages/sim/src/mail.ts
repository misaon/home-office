import type { AgentId } from "@ho/protocol";
import { facingTowards, type Point } from "./grid.ts";
import { setEmotion } from "./intents.ts";
import { pendingDeliveries, resumeSteps, setSteps, spawnActor, walkSteps } from "./actors.ts";
import { type Actor, anchorOf, type Step, type World } from "./world.ts";

const DROP_MS = 900;
const PICKUP_MS = 800;
const HANDOVER_MS = 1200;
const MAILBOX_SPRITE = "furniture/mailbox";

const mailboxAnchor = (
  world: World,
  floorId: string,
): { at: Point; facing: "n" | "e" | "s" | "w" } | undefined =>
  world.floors.get(floorId)?.template.anchors.find((a) => a.kind === "mailbox");

/**
 * The postman: a visitor who arrives by the floor's elevator, walks to the reception's mail counter, drops the
 * envelope (`mail_dropped`), walks back into the car and leaves (`visitor_left`). Returns false when the floor
 * has no mail counter, in which case the host should treat the mail as delivered.
 */
export function deliverMail(
  world: World,
  floorId: string,
  visitorId: AgentId,
  sprite: string,
  ref: string,
): boolean {
  const mailbox = mailboxAnchor(world, floorId);
  if (mailbox === undefined) {
    return false;
  }
  const car = anchorOf(world, floorId, "car")?.at ?? mailbox.at;
  // The postman rides the elevator like everybody else (no explicit place → arrival queue).
  const postman = spawnActor(world, visitorId, sprite, floorId, { kind: "visitor" });
  setSteps(postman, [
    ...walkSteps(world, postman, floorId, mailbox.at),
    { kind: "dwell", activity: "drop", facing: mailbox.facing, until: null, ms: DROP_MS },
    { kind: "emit", event: { kind: "mail_dropped", ref } },
    ...walkSteps(world, postman, floorId, car),
    { kind: "emit", event: { kind: "visitor_left", actorId: visitorId } },
  ]);
  return true;
}

const besides = (world: World, target: Actor): Point => {
  const floor = world.floors.get(target.floorId);
  const at =
    target.hidden && target.home !== null
      ? (anchorOf(world, target.floorId, target.home.anchorId)?.at ?? target.tile)
      : target.tile;
  const options: Point[] = [
    { x: at.x - 1, y: at.y },
    { x: at.x + 1, y: at.y },
    { x: at.x, y: at.y + 1 },
    { x: at.x, y: at.y - 1 },
  ];
  return options.find((p) => floor?.grid.isWalkable(p) === true) ?? at;
};

/** Walk to the boss, hand the envelope over, emit `envelope_delivered`, then back to the desk or home. */
const handToBoss = (
  world: World,
  courier: Actor,
  boss: Actor,
  ref: string,
  before: Step[],
): void => {
  const meet = besides(world, boss);
  setEmotion(world, courier.id, "envelope", null);
  setSteps(courier, [
    ...pendingDeliveries(courier),
    ...before,
    ...walkSteps(world, courier, boss.floorId, meet),
    {
      kind: "dwell",
      activity: "handover",
      facing: facingTowards(meet, boss.hidden ? meet : boss.tile),
      until: null,
      ms: HANDOVER_MS,
    },
    { kind: "emit", event: { kind: "envelope_delivered", ref, by: courier.id, to: boss.id } },
    ...resumeSteps(world, courier),
  ]);
};

/**
 * The courier (Lola, or the boss himself when she is missing) fetches the envelope from the mail counter and
 * brings it to the boss; `envelope_delivered` fires at the handover (or at the counter when the boss fetches it).
 */
export function fetchMail(
  world: World,
  floorId: string,
  courierId: AgentId,
  bossId: AgentId,
  ref: string,
): boolean {
  const courier = world.actors.get(courierId);
  const boss = world.actors.get(bossId);
  const mailbox = mailboxAnchor(world, floorId);
  if (courier === undefined || boss === undefined || mailbox === undefined) {
    return false;
  }
  const pickup: Step[] = [
    ...walkSteps(world, courier, floorId, mailbox.at),
    { kind: "dwell", activity: "receive", facing: mailbox.facing, until: null, ms: PICKUP_MS },
  ];
  if (courierId === bossId) {
    setSteps(courier, [
      ...pendingDeliveries(courier),
      ...pickup,
      { kind: "emit", event: { kind: "envelope_delivered", ref, by: courierId, to: bossId } },
      ...resumeSteps(world, courier),
    ]);
    return true;
  }
  handToBoss(world, courier, boss, ref, pickup);
  return true;
}

/**
 * A chat message: the receptionist takes the envelope from her counter straight to the boss's office
 * (`envelope_delivered` at the handover) and returns behind the counter.
 */
export function carryEnvelope(
  world: World,
  courierId: AgentId,
  bossId: AgentId,
  ref: string,
): boolean {
  const courier = world.actors.get(courierId);
  const boss = world.actors.get(bossId);
  if (courier === undefined || boss === undefined || courier.floorId !== boss.floorId) {
    return false;
  }
  if (courierId === bossId) {
    return false;
  }
  handToBoss(world, courier, boss, ref, []);
  return true;
}

/** Mail counter art follows the pile: `full` while envelopes wait, `empty` otherwise. */
export function setMailboxState(world: World, floorId: string, state: "empty" | "full"): void {
  const floor = world.floors.get(floorId);
  if (floor === undefined) {
    return;
  }
  for (const item of floor.template.furniture) {
    if (item.sprite === MAILBOX_SPRITE) {
      item.animation = state;
    }
  }
}
