import { errorMessage } from "@ho/protocol";
import { planSessionStarts } from "@ho/core";
import type { DaemonConfig } from "./config.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import type { SessionManager } from "./sessions.ts";

/** How long to wait before retrying a task the office gate is still animating. */
const GATE_RETRY_MS = 1_000;

/** Starts sessions for assigned tasks whenever the model changes, plus a retry while the office animates. */
export function startScheduler(
  office: Office,
  sessions: SessionManager,
  config: DaemonConfig,
  gate: OfficeGate,
  log: Logger,
): { stop: () => Promise<void> } {
  const controller = new AbortController();
  let active: Promise<void> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const retryLater = (): void => {
    if (retry !== null || controller.signal.aborted) {
      return;
    }
    retry = setTimeout(() => {
      retry = null;
      void tick();
    }, GATE_RETRY_MS);
  };
  const run = async (): Promise<void> => {
    try {
      const now = office.clock.now().toISOString();
      for (const start of planSessionStarts(office.model, {
        maxConcurrentSessions: config.scheduler.maxConcurrentSessions,
      })) {
        if (controller.signal.aborted) {
          break;
        }
        const task = office.model.tasks.get(start.taskId);
        if (task !== undefined && gate.blocks(task, now)) {
          log.debug({ taskId: start.taskId }, "waiting for the office to deliver the handoff");
          retryLater();
          continue;
        }
        log.info({ taskId: start.taskId, agentId: start.agentId }, "scheduling session");
        await sessions.start(start.taskId, start.agentId, start.mode);
      }
    } catch (error) {
      log.error({ err: errorMessage(error) }, "scheduler tick failed");
    }
  };
  const tick = (): Promise<void> => {
    if (controller.signal.aborted) {
      return Promise.resolve();
    }
    active ??= run().finally(() => {
      active = null;
    });
    return active;
  };
  const listening = (async () => {
    for await (const event of office.store.subscribe(
      {
        types: [
          "task.created",
          "task.assigned",
          "task.reviewer_assigned",
          "task.status_changed",
          "session.ended",
          "agent.updated",
        ],
      },
      controller.signal,
    )) {
      void event;
      void tick();
    }
  })().catch((error: unknown) => {
    log.error({ err: String(error) }, "scheduler subscription failed");
  });
  return {
    stop: async () => {
      if (retry !== null) {
        clearTimeout(retry);
      }
      controller.abort();
      await listening;
      await active;
    },
  };
}
