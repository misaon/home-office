import { bossOf } from "@ho/core";
import type { AgentId, MailItem, MailItemId, ProjectId, TaskId } from "@ho/protocol";
import { deliverMail, fetchMail, receive, type SimEvent, type World } from "@ho/sim";
import { model } from "../store.ts";

type PendingMail = { mailId: MailItemId; taskId: TaskId; floorId: ProjectId };

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

  sweep(walking: (ref: string) => boolean): void {
    for (const pending of this.#pending.filter((item) => !walking(item.mailId))) {
      this.#finish(pending);
    }
  }

  flush(): void {
    for (const pending of this.#pending.splice(0)) {
      this.#delivered(pending.taskId);
    }
  }

  onMail(mail: MailItem, watching: boolean): void {
    const { taskId } = mail;
    if (taskId === undefined) {
      return;
    }
    if (
      !watching ||
      bossOf(model, mail.projectId) === undefined ||
      !this.#world.floors.has(mail.projectId) ||
      !deliverMail(this.#world, mail.projectId, this.#visitorId(), mail.id)
    ) {
      this.#delivered(taskId);
      return;
    }
    this.#pending.push({ mailId: mail.id, taskId, floorId: mail.projectId });
  }

  onSimEvent(event: SimEvent): boolean {
    if (event.kind === "mail_dropped") {
      this.#onDropped(event.ref);
      return true;
    }
    if (event.kind === "delivered") {
      const pending = this.#pending.find((p) => p.mailId === event.ref);
      if (pending === undefined) {
        return false;
      }
      receive(this.#world, event.to, event.by);
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
    const boss = bossOf(model, pending.floorId);
    const courier = this.#receptionist(pending.floorId) ?? boss?.id ?? null;
    if (
      boss === undefined ||
      courier === null ||
      !fetchMail(this.#world, pending.floorId, courier, boss.id, mailId)
    ) {
      this.#finish(pending);
    }
  }

  #finish(pending: PendingMail): void {
    const index = this.#pending.indexOf(pending);
    if (index !== -1) {
      this.#pending.splice(index, 1);
    }
    this.#delivered(pending.taskId);
  }
}
