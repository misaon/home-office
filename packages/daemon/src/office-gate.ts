import type { Task, TaskId } from "@ho/protocol";
import type { Logger } from "./logger.ts";

type Waiter = { taskId: TaskId; since: string; resolve: () => void };

/**
 * Holds the daemon back while an office UI is watching so an envelope's walk finishes first: the recipient's
 * session of a handoff, the boss's triage of a chat message or mail (Lola's walk from the reception), and
 * the boss's status post when finished work walks back to him. Without viewers, or after the timeout,
 * nothing waits.
 */
export class OfficeGate {
  readonly #timeoutMs: number;
  readonly #delivered = new Map<TaskId, string>();
  readonly #waiters = new Set<Waiter>();
  readonly #log: Logger;
  #viewers = 0;

  constructor(log: Logger, timeoutMs = 30_000) {
    this.#log = log;
    this.#timeoutMs = timeoutMs;
  }

  get viewers(): number {
    return this.#viewers;
  }

  /** Registers a viewer; the returned function unregisters it. When the last viewer leaves, nobody waits. */
  attach(): () => void {
    this.#viewers += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#viewers -= 1;
        if (this.#viewers === 0) {
          this.#release(() => true);
        }
      }
    };
  }

  /** The office reports that the envelope for this task reached its recipient. */
  delivered(taskId: TaskId, at: string): void {
    this.#delivered.set(taskId, at);
    this.#log.info({ taskId }, "envelope delivered by the office");
    this.#release((w) => w.taskId === taskId && at >= w.since);
  }

  /**
   * True while the task's latest envelope (a handoff note, or its birth as a chat or mail triage) is fresh,
   * undelivered and somebody is watching.
   */
  blocks(task: Task, now: string): boolean {
    if (this.#viewers === 0) {
      return false;
    }
    const handoff = task.notes.findLast((n) => n.kind === "handoff");
    const since = handoff?.at ?? (task.kind === "triage" ? task.createdAt : undefined);
    if (since === undefined) {
      return false;
    }
    const deliveredAt = this.#delivered.get(task.id);
    if (deliveredAt !== undefined && deliveredAt >= since) {
      return false;
    }
    if (Date.parse(now) - Date.parse(since) > this.#timeoutMs) {
      this.#log.warn(
        { taskId: task.id },
        "office animation timed out; starting the session anyway",
      );
      this.#delivered.set(task.id, now);
      return false;
    }
    return true;
  }

  /**
   * Resolves once the office delivered this task's envelope at or after `since`, when the last viewer leaves,
   * or after the timeout — whichever comes first. Resolves at once without viewers.
   */
  waitFor(taskId: TaskId, since: string): Promise<void> {
    const deliveredAt = this.#delivered.get(taskId);
    if (this.#viewers === 0 || (deliveredAt !== undefined && deliveredAt >= since)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const waiter: Waiter = { taskId, since, resolve };
      this.#waiters.add(waiter);
      setTimeout(() => {
        if (this.#waiters.delete(waiter)) {
          this.#log.warn({ taskId }, "office animation timed out; continuing without it");
          resolve();
        }
      }, this.#timeoutMs);
    });
  }

  #release(matches: (w: Waiter) => boolean): void {
    for (const waiter of this.#waiters) {
      if (matches(waiter)) {
        this.#waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }
}
