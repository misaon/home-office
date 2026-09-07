import { planSessionStarts } from "@ho/core";
import type { DaemonConfig } from "./config.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import type { SessionManager } from "./sessions.ts";

const TICK_MS = 2_000;

/** Starts sessions for assigned tasks whenever the model changes or on a slow heartbeat. */
export function startScheduler(
  office: Office,
  sessions: SessionManager,
  config: DaemonConfig,
  gate: OfficeGate,
  log: Logger,
): { stop: () => void } {
  const controller = new AbortController();
  let ticking = false;
  const tick = async (): Promise<void> => {
    if (ticking || controller.signal.aborted) {
      return;
    }
    ticking = true;
    try {
      const now = office.clock.now().toISOString();
      for (const start of planSessionStarts(office.model, {
        maxConcurrentSessions: config.scheduler.maxConcurrentSessions,
      })) {
        const task = office.model.tasks.get(start.taskId);
        if (task !== undefined && gate.blocks(task, now)) {
          log.debug({ taskId: start.taskId }, "waiting for the office to deliver the handoff");
          continue;
        }
        log.info({ taskId: start.taskId, agentId: start.agentId }, "scheduling session");
        await sessions.start(start.taskId, start.agentId, start.mode);
      }
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : String(error) },
        "scheduler tick failed",
      );
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void (async () => {
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
  })();
  return {
    stop: () => {
      clearInterval(timer);
      controller.abort();
    },
  };
}
