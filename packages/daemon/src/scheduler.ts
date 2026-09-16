import { planSessionStarts } from "@ho/core";
import { errorMessage } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { SessionManager } from "./sessions.ts";

export function startScheduler(
  office: Office,
  sessions: SessionManager,
  config: DaemonConfig,
  gate: OfficeGate,
  log: Logger,
): { stop: () => Promise<void> } {
  let stopped = false;
  let active: Promise<void> | null = null;
  let again = false;
  const run = async (): Promise<void> => {
    try {
      const now = office.clock.now().toISOString();
      const plan = planSessionStarts(
        office.model,
        config.scheduler.maxConcurrentSessions,
        config.services.enabled,
      );
      log.debug(
        {
          starts: plan.starts.length,
          skipped: plan.skipped,
          capacity: plan.capacity,
          active: office.model.activeSessions.size,
          max: config.scheduler.maxConcurrentSessions,
        },
        "scheduler tick",
      );
      for (const start of plan.starts) {
        if (stopped) {
          break;
        }
        const task = office.model.tasks.get(start.taskId);
        if (task !== undefined && gate.blocks(task, now)) {
          log.debug({ taskId: start.taskId }, "waiting for the office to deliver the handoff");
          continue;
        }
        log.info({ taskId: start.taskId, agentId: start.agentId }, "scheduling session");
        await sessions.start(start.taskId, start.agentId, start.mode);
      }
    } catch (error) {
      log.error({ err: errorMessage(error) }, "scheduler tick failed");
    }
  };
  const tick = (): void => {
    if (stopped) {
      return;
    }
    if (active !== null) {
      again = true;
      return;
    }
    active = run().finally(() => {
      active = null;
      if (again) {
        again = false;
        tick();
      }
    });
  };
  const following = followEvents(
    office,
    [
      "task.created",
      "task.assigned",
      "task.reviewer_assigned",
      "task.status_changed",
      "session.ended",
      "agent.updated",
    ],
    tick,
    log,
    "scheduler",
  );
  const unsubscribe = gate.onRelease(tick);
  tick();
  return {
    stop: async () => {
      stopped = true;
      unsubscribe();
      await following.stop();
      await active;
    },
  };
}
