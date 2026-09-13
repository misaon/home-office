import type { Task, TaskId } from "@ho/protocol";
import type { Logger } from "./logger.ts";

/** Envelopes remembered per task; only the newest matter, so the oldest are dropped. */
const DELIVERED_LIMIT = 512;

/** When a task's latest envelope was posted: a handoff note, or its birth as a chat or mail triage. */
const envelopeSince = (task: Task): string | undefined =>
  task.notes.findLast((n) => n.kind === "handoff")?.at ??
  (task.kind === "triage" ? task.createdAt : undefined);

/**
 * Holds the daemon back while an office UI is watching so an envelope's walk finishes first: the recipient's
 * session of a handoff, the boss's triage of a chat message or mail (Lola's walk from the reception), and
 * the boss's status post when finished work walks back to him. Without viewers, or after the timeout,
 * nothing waits. Waiters are released by `delivered`, by the last viewer leaving, or by their own timeout.
 */
export class OfficeGate {
  readonly #timeoutMs: number;
  readonly #delivered = new Map<TaskId, string>();
  readonly #listeners = new Set<() => void>();
  readonly #log: Logger;
  #viewers = 0;

  constructor(log: Logger, timeoutMs = 30_000) {
    this.#log = log;
    this.#timeoutMs = timeoutMs;
  }

  /** Registers a viewer; the returned function unregisters it. When the last viewer leaves, nobody waits. */
  attach(): () => void {
    this.#viewers += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#viewers = Math.max(0, this.#viewers - 1);
        if (this.#viewers === 0) {
          this.#notify();
        }
      }
    };
  }

  /** The office reports that the envelope for this task reached its recipient. */
  delivered(taskId: TaskId, at: string): void {
    this.#delivered.delete(taskId);
    this.#delivered.set(taskId, at);
    for (const oldest of this.#delivered.keys()) {
      if (this.#delivered.size <= DELIVERED_LIMIT) {
        break;
      }
      this.#delivered.delete(oldest);
    }
    this.#log.info({ taskId }, "envelope delivered by the office");
    this.#notify();
  }

  /** Runs `listener` whenever a wait may have ended; the returned function unsubscribes it. */
  onRelease(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** True while the task's latest envelope is fresh, undelivered and somebody is watching. */
  blocks(task: Task, now: string): boolean {
    const since = envelopeSince(task);
    return since !== undefined && this.#waits(task.id, since, now);
  }

  /**
   * Resolves once the office delivered this task's envelope at or after `since`, when the last viewer leaves,
   * or after the timeout — whichever comes first. Resolves at once without viewers.
   */
  waitFor(taskId: TaskId, since: string): Promise<void> {
    if (!this.#waits(taskId, since, new Date().toISOString())) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = setTimeout(() => {
        this.#log.warn({ taskId }, "office animation timed out; continuing without it");
        finish();
      }, this.#timeoutMs);
      const unsubscribe = this.onRelease(() => {
        if (!this.#waits(taskId, since, new Date().toISOString())) {
          finish();
        }
      });
    });
  }

  close(): void {
    this.#viewers = 0;
    this.#notify();
  }

  #waits(taskId: TaskId, since: string, now: string): boolean {
    if (this.#viewers === 0) {
      return false;
    }
    const deliveredAt = this.#delivered.get(taskId);
    if (deliveredAt !== undefined && deliveredAt >= since) {
      return false;
    }
    return Date.parse(now) - Date.parse(since) <= this.#timeoutMs;
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
