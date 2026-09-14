import type { AgentId } from "@ho/protocol";
import { pendingDeliveries, resumeSteps, setSteps, spawnActor, walkSteps } from "./actors.ts";
import { carry } from "./intents.ts";
import type { Anchor } from "./map.ts";
import { anchorOf, type Step, type World } from "./world.ts";

const DROP_MS = 900;
const PICKUP_MS = 800;

const mailboxAnchor = (world: World, floorId: string): Anchor | undefined =>
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
  ref: string,
): boolean {
  const mailbox = mailboxAnchor(world, floorId);
  if (mailbox === undefined) {
    return false;
  }
  const car = anchorOf(world, floorId, "car")?.at ?? mailbox.at;
  // The postman rides the elevator like everybody else (no explicit place → arrival queue).
  const postman = spawnActor(world, visitorId, floorId, { kind: "visitor" });
  setSteps(postman, [
    ...walkSteps(floorId, mailbox.at),
    { kind: "dwell", activity: "drop", facing: mailbox.facing, until: null, ms: DROP_MS },
    { kind: "emit", event: { kind: "mail_dropped", ref } },
    ...walkSteps(floorId, car),
    { kind: "emit", event: { kind: "visitor_left", actorId: visitorId } },
  ]);
  return true;
}

/**
 * The courier (Lola, or the boss himself when she is missing) fetches the envelope from the mail counter and
 * brings it to the boss; `delivered` fires at the handover (or at the counter when the boss fetches it).
 */
export function fetchMail(
  world: World,
  floorId: string,
  courierId: AgentId,
  bossId: AgentId,
  ref: string,
): boolean {
  const mailbox = mailboxAnchor(world, floorId);
  if (mailbox === undefined) {
    return false;
  }
  const pickup: Step[] = [
    ...walkSteps(floorId, mailbox.at),
    { kind: "dwell", activity: "receive", facing: mailbox.facing, until: null, ms: PICKUP_MS },
  ];
  if (courierId !== bossId) {
    return carry(world, courierId, bossId, ref, pickup);
  }
  const boss = world.actors.get(bossId);
  if (boss === undefined || boss.floorId !== floorId) {
    return false;
  }
  setSteps(boss, [
    ...pendingDeliveries(boss),
    ...pickup,
    { kind: "emit", event: { kind: "delivered", ref, by: bossId, to: bossId } },
    ...resumeSteps(world, boss),
  ]);
  return true;
}
