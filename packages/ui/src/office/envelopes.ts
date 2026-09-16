import type { TaskId } from "@ho/protocol";
import type { Client } from "../rpc.ts";

export class Envelopes {
  #client: Client | null = null;
  readonly #walking = new Map<TaskId, number>();
  readonly #unreported: TaskId[] = [];

  attach(client: Client): void {
    this.#client = client;
    for (const taskId of this.#unreported.splice(0)) {
      this.report(taskId);
    }
  }

  detach(): void {
    this.#client = null;
  }

  sent(taskId: TaskId): void {
    this.#walking.set(taskId, (this.#walking.get(taskId) ?? 0) + 1);
  }

  arrived(taskId: TaskId): boolean {
    const count = this.#walking.get(taskId);
    if (count === undefined) {
      return false;
    }
    if (count > 1) {
      this.#walking.set(taskId, count - 1);
    } else {
      this.#walking.delete(taskId);
    }
    return true;
  }

  report(taskId: TaskId): void {
    const client = this.#client;
    if (client === null) {
      this.#unreported.push(taskId);
      return;
    }
    void client.office.delivered({ taskId }).catch(() => {
      this.#unreported.push(taskId);
    });
  }

  flush(): void {
    for (const [taskId, count] of this.#walking) {
      for (let i = 0; i < count; i += 1) {
        this.report(taskId);
      }
    }
    this.#walking.clear();
  }

  sweep(walking: (taskId: TaskId) => number): void {
    for (const [taskId, count] of new Map(this.#walking)) {
      for (let i = walking(taskId); i < count; i += 1) {
        this.arrived(taskId);
        this.report(taskId);
      }
    }
  }
}
