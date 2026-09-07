import { bossOf } from "@ho/core";
import type { AgentId, MailItem, ProjectId, TaskId } from "@ho/protocol";
import {
  deliverMail,
  fetchMail,
  receive,
  setMailboxState,
  type SimEvent,
  type World,
} from "@ho/sim";
import { model } from "../store.ts";

/** Mail on its way: dropped at the reception by the postman, then carried to the boss by Lola. */
type PendingMail = {
  mailId: string;
  taskId: TaskId;
  floorId: ProjectId;
  stage: "postman" | "counter" | "courier";
};

const POSTMAN_SPRITE = "characters/postman";

/**
 * The postman-and-receptionist choreography for incoming mail, per floor. The host reports `delivered(taskId)`
 * to the daemon once the boss holds the envelope (or right away when nobody is watching), which releases the
 * triage session.
 */
export class MailFlow {
  readonly #world: World;
  readonly #visitorId: () => AgentId;
  readonly #delivered: (taskId: TaskId) => void;
  readonly #receptionist: (floorId: string) => AgentId | null;
  readonly #pending: PendingMail[] = [];

  constructor(
    world: World,
    visitorId: () => AgentId,
    delivered: (taskId: TaskId) => void,
    receptionist: (floorId: string) => AgentId | null,
  ) {
    this.#world = world;
    this.#visitorId = visitorId;
    this.#delivered = delivered;
    this.#receptionist = receptionist;
  }

  /** Nobody is watching any more: whatever is in flight counts as delivered. */
  flush(): void {
    for (const pending of this.#pending.splice(0)) {
      this.#delivered(pending.taskId);
      setMailboxState(this.#world, pending.floorId, "empty");
    }
  }

  /** A new item: the postman rides up to the floor, or the boss gets it right away without viewers. */
  onMail(mail: MailItem, watching: boolean): void {
    const taskId = mail.taskId;
    if (taskId === undefined) {
      return;
    }
    const boss = bossOf(model, mail.projectId);
    if (
      !watching ||
      boss === undefined ||
      !this.#world.floors.has(mail.projectId) ||
      !deliverMail(this.#world, mail.projectId, this.#visitorId(), POSTMAN_SPRITE, mail.id)
    ) {
      this.#delivered(taskId);
      return;
    }
    this.#pending.push({ mailId: mail.id, taskId, floorId: mail.projectId, stage: "postman" });
  }

  /** Sim events that belong to the mail flow; returns false for anything else. */
  onSimEvent(event: SimEvent): boolean {
    if (event.kind === "mail_dropped") {
      this.#onDropped(event.ref);
      return true;
    }
    if (event.kind === "envelope_delivered") {
      const pending = this.#pending.find((p) => p.mailId === event.ref);
      if (pending === undefined) {
        return false;
      }
      if (event.by !== event.to) {
        receive(this.#world, event.to, event.by);
      }
      this.#finish(pending);
      return true;
    }
    return false;
  }

  #onDropped(mailId: string): void {
    const pending = this.#pending.find((p) => p.mailId === mailId);
    if (pending === undefined) {
      return;
    }
    setMailboxState(this.#world, pending.floorId, "full");
    pending.stage = "counter";
    const boss = bossOf(model, pending.floorId);
    // Lola carries the post; a floor without her (mid-setup) sends the boss to fetch it himself.
    const courier = this.#receptionist(pending.floorId) ?? boss?.id ?? null;
    if (
      boss === undefined ||
      courier === null ||
      !fetchMail(this.#world, pending.floorId, courier, boss.id, mailId)
    ) {
      this.#finish(pending);
      return;
    }
    pending.stage = "courier";
  }

  #finish(pending: PendingMail): void {
    const index = this.#pending.indexOf(pending);
    if (index >= 0) {
      this.#pending.splice(index, 1);
    }
    if (
      !this.#pending.some(
        (p) => p.floorId === pending.floorId && (p.stage === "counter" || p.stage === "courier"),
      )
    ) {
      setMailboxState(this.#world, pending.floorId, "empty");
    }
    this.#delivered(pending.taskId);
  }
}
