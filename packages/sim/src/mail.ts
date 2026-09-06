import type { AgentId } from "@ho/protocol";
import { facingTowards, type Point } from "./grid.ts";
import { LOBBY_ID } from "./templates.ts";
import {
  type Actor,
  anchorOf,
  freeAnchors,
  resumeSteps,
  setSteps,
  spawnActor,
  type Step,
  walkSteps,
  type World,
} from "./world.ts";

const DROP_MS = 900;
const PICKUP_MS = 800;
const HANDOVER_MS = 1200;
const MAILBOX_SPRITE = "furniture/mailbox";

const mailboxAnchor = (world: World): { at: Point; facing: "n" | "e" | "s" | "w" } | undefined =>
  world.floors.get(LOBBY_ID)?.template.anchors.find((a) => a.kind === "mailbox");

/**
 * The postman: a visitor spawned at the Lobby's street door who walks to the mailbox, drops the envelope
 * (`mail_dropped`), walks back out and leaves (`visitor_left`). Returns false when the Lobby has no
 * mailbox, in which case the host should treat the mail as delivered.
 */
export function deliverMail(
  world: World,
  visitorId: AgentId,
  sprite: string,
  mailId: string,
): boolean {
  const mailbox = mailboxAnchor(world);
  const entrance = anchorOf(world, LOBBY_ID, "entrance");
  if (mailbox === undefined) {
    return false;
  }
  const door = entrance?.at ?? mailbox.at;
  const postman = spawnActor(world, visitorId, sprite, LOBBY_ID, { kind: "visitor", at: door });
  setSteps(postman, [
    ...walkSteps(world, postman, LOBBY_ID, mailbox.at),
    { kind: "dwell", activity: "drop", facing: mailbox.facing, until: null, ms: DROP_MS },
    { kind: "emit", event: { kind: "mail_dropped", mailId } },
    ...walkSteps(world, postman, LOBBY_ID, door),
    { kind: "emit", event: { kind: "visitor_left", actorId: visitorId } },
  ]);
  return true;
}

const besides = (world: World, target: Actor): Point => {
  const floor = world.floors.get(target.floorId);
  const options: Point[] = [
    { x: target.tile.x - 1, y: target.tile.y },
    { x: target.tile.x + 1, y: target.tile.y },
    { x: target.tile.x, y: target.tile.y + 1 },
    { x: target.tile.x, y: target.tile.y - 1 },
  ];
  return options.find((p) => floor?.grid.isWalkable(p) === true) ?? target.tile;
};

/**
 * A courier (the clerk, an idle colleague, or the boss) fetches the envelope from the mailbox and brings
 * it to the boss; `mail_delivered` fires at the handover (or at the mailbox when the boss fetches it).
 * Working actors return to their desks afterwards.
 */
export function fetchMail(
  world: World,
  courierId: AgentId,
  bossId: AgentId,
  mailId: string,
): boolean {
  const courier = world.actors.get(courierId);
  const boss = world.actors.get(bossId);
  const mailbox = mailboxAnchor(world);
  if (courier === undefined || boss === undefined || mailbox === undefined) {
    return false;
  }
  const pickup: Step[] = [
    ...walkSteps(world, courier, LOBBY_ID, mailbox.at),
    { kind: "dwell", activity: "receive", facing: mailbox.facing, until: null, ms: PICKUP_MS },
  ];
  const delivered: Step = {
    kind: "emit",
    event: { kind: "mail_delivered", mailId, by: courierId, to: bossId },
  };
  if (courierId === bossId) {
    setSteps(courier, [...pickup, delivered, ...resumeSteps(world, courier)]);
    return true;
  }
  const meet = besides(world, boss);
  setSteps(courier, [
    ...pickup,
    ...walkSteps(world, courier, boss.floorId, meet),
    {
      kind: "dwell",
      activity: "handover",
      facing: facingTowards(meet, boss.tile),
      until: null,
      ms: HANDOVER_MS,
    },
    delivered,
    ...resumeSteps(world, courier),
  ]);
  return true;
}

/** Idle colleagues who could fetch the mail: the clerk first (chosen by the host), then anyone not working. */
export const idleCandidates = (world: World, ids: readonly AgentId[]): AgentId[] =>
  ids.filter((id) => {
    const actor = world.actors.get(id);
    return actor !== undefined && actor.kind === "agent" && actor.work === null && !actor.hidden;
  });

/** Mailbox art follows the pile: `full` while envelopes wait, `empty` otherwise. */
export function setMailboxState(world: World, state: "empty" | "full"): void {
  const floor = world.floors.get(LOBBY_ID);
  if (floor === undefined) {
    return;
  }
  for (const item of floor.template.furniture) {
    if (item.sprite === MAILBOX_SPRITE) {
      item.animation = state;
    }
  }
}

export const hasMailbox = (world: World): boolean =>
  freeAnchors(world, LOBBY_ID, "mailbox").length > 0 || mailboxAnchor(world) !== undefined;
