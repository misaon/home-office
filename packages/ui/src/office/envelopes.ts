import type { TaskId } from "@ho/protocol";
import type { Client } from "../rpc.ts";

/**
 * What the daemon is waiting to hear: every envelope this office is walking somewhere, and the report
 * that it arrived. Exactly one report per envelope — the gate holds a task's session until it comes, and
 * a task can be carrying two at once (a handoff while its triage is still on its way to the boss).
 */
export class Envelopes {
  #client: Client | null = null;
  readonly #walking = new Map<TaskId, number>();
  /** Reports the daemon has not heard yet because the connection was gone; flushed on the next one. */
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

  /** An envelope left with a carrier. */
  sent(taskId: TaskId): void {
    this.#walking.set(taskId, (this.#walking.get(taskId) ?? 0) + 1);
  }

  /** One envelope of this task arrived; false when this office was not carrying one. */
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

  /** Tells the daemon an envelope arrived. Offline, it is remembered for the next connection. */
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

  /** Nobody is watching any more: everything in flight counts as arrived. */
  flush(): void {
    for (const [taskId, count] of this.#walking) {
      for (let i = 0; i < count; i += 1) {
        this.report(taskId);
      }
    }
    this.#walking.clear();
  }

  /**
   * Envelopes whose carrier left the office — a removed floor or a dismissed colleague takes their steps
   * with them — can never arrive, so the daemon hears about them instead of waiting out its timeout.
   */
  sweep(walking: (taskId: TaskId) => number): void {
    for (const [taskId, count] of Array.from(this.#walking)) {
      for (let i = walking(taskId); i < count; i += 1) {
        this.arrived(taskId);
        this.report(taskId);
      }
    }
  }
}
