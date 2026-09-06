import type { Task, TaskId } from "@ho/protocol";
import type { Logger } from "./logger.ts";

/**
 * Holds back the recipient's session after a handoff while an office UI is watching, so the animation
 * (walk, elevator, handover) finishes first. Without viewers, or after the timeout, nothing waits.
 */
export class HandoffGate {
  readonly #timeoutMs: number;
  readonly #delivered = new Map<TaskId, string>();
  readonly #log: Logger;
  #viewers = 0;

  constructor(log: Logger, timeoutMs = 20_000) {
    this.#log = log;
    this.#timeoutMs = timeoutMs;
  }

  get viewers(): number {
    return this.#viewers;
  }

  /** Registers a viewer; the returned function unregisters it. */
  attach(): () => void {
    this.#viewers += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#viewers -= 1;
      }
    };
  }

  delivered(taskId: TaskId, at: string): void {
    this.#delivered.set(taskId, at);
    this.#log.info({ taskId }, "handoff delivered by the office");
  }

  /** True while the task's latest handoff is fresh, undelivered and somebody is watching. */
  blocks(task: Task, now: string): boolean {
    if (this.#viewers === 0) {
      return false;
    }
    const handoff = task.notes.findLast((n) => n.kind === "handoff");
    if (handoff === undefined) {
      return false;
    }
    const deliveredAt = this.#delivered.get(task.id);
    if (deliveredAt !== undefined && deliveredAt >= handoff.at) {
      return false;
    }
    if (Date.parse(now) - Date.parse(handoff.at) > this.#timeoutMs) {
      this.#log.warn(
        { taskId: task.id },
        "handoff animation timed out; starting the session anyway",
      );
      this.#delivered.set(task.id, now);
      return false;
    }
    return true;
  }
}
