import type { AgentId, MailItem, TaskId } from "@ho/protocol";
import {
  deliverMail,
  fetchMail,
  idleCandidates,
  receive,
  setEmotion,
  setMailboxState,
  type SimEvent,
  type World,
} from "@ho/sim";
import { model } from "../store.ts";

/** Mail on its way: dropped by the postman, then carried to the boss by a courier. */
type PendingMail = { mailId: string; taskId: TaskId; stage: "postman" | "mailbox" | "courier" };

const POSTMAN_SPRITE = "characters/postman";

/**
 * The postman-and-courier choreography for incoming mail. The host reports `delivered(taskId)` to the daemon
 * once the boss holds the envelope (or right away when nobody is watching), which releases the triage session.
 */
export class MailFlow {
  readonly #world: World;
  readonly #visitorId: () => AgentId;
  readonly #delivered: (taskId: TaskId) => void;
  readonly #pending: PendingMail[] = [];

  constructor(world: World, visitorId: () => AgentId, delivered: (taskId: TaskId) => void) {
    this.#world = world;
    this.#visitorId = visitorId;
    this.#delivered = delivered;
  }

  /** Nobody is watching any more: whatever is in flight counts as delivered. */
  flush(): void {
    for (const pending of this.#pending.splice(0)) {
      this.#delivered(pending.taskId);
    }
    setMailboxState(this.#world, "empty");
  }

  /** A new item: the postman walks in, or the boss gets it right away without viewers or a mailbox. */
  onMail(mail: MailItem, watching: boolean): void {
    const taskId = mail.taskId;
    if (taskId === undefined) {
      return;
    }
    const boss = [...model.agents.values()].find((a) => a.role === "boss");
    if (
      !watching ||
      boss === undefined ||
      !deliverMail(this.#world, this.#visitorId(), POSTMAN_SPRITE, mail.id)
    ) {
      this.#delivered(taskId);
      return;
    }
    this.#pending.push({ mailId: mail.id, taskId, stage: "postman" });
  }

  /** Sim events that belong to the mail flow; returns false for anything else. */
  onSimEvent(event: SimEvent): boolean {
    if (event.kind === "mail_dropped") {
      this.#onDropped(event.mailId);
      return true;
    }
    if (event.kind === "mail_delivered") {
      const pending = this.#pending.find((p) => p.mailId === event.mailId);
      if (pending !== undefined) {
        if (event.by !== event.to) {
          receive(this.#world, event.to, event.by);
        }
        setEmotion(this.#world, event.to, "envelope", 4000);
        this.#finish(pending);
      }
      return true;
    }
    return false;
  }

  /** The clerk if there is one, else an idle colleague, else the boss walks over himself. */
  #courierFor(bossId: AgentId): AgentId | null {
    const agents = [...model.agents.values()];
    const clerks = idleCandidates(
      this.#world,
      agents.filter((a) => a.role === "clerk").map((a) => a.id),
    );
    const others = idleCandidates(
      this.#world,
      agents.filter((a) => a.role !== "clerk" && a.role !== "boss").map((a) => a.id),
    );
    return (
      clerks[0] ?? this.#world.rng.pick(others) ?? (this.#world.actors.has(bossId) ? bossId : null)
    );
  }

  #onDropped(mailId: string): void {
    const pending = this.#pending.find((p) => p.mailId === mailId);
    if (pending === undefined) {
      return;
    }
    setMailboxState(this.#world, "full");
    pending.stage = "mailbox";
    const boss = [...model.agents.values()].find((a) => a.role === "boss");
    const courier = boss === undefined ? null : this.#courierFor(boss.id);
    if (
      boss === undefined ||
      courier === null ||
      !fetchMail(this.#world, courier, boss.id, mailId)
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
    if (!this.#pending.some((p) => p.stage === "mailbox" || p.stage === "courier")) {
      setMailboxState(this.#world, "empty");
    }
    this.#delivered(pending.taskId);
  }
}
