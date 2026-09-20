import { dependentsOf, planSessionStarts, transitionTask } from "@ho/core";
import { errorMessage, type StoredEvent, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { SessionManager } from "./sessions.ts";

const WAITING_STATUSES: ReadonlySet<Task["status"]> = new Set(["inbox", "planned", "assigned"]);

const block = (office: Office, task: Task, reason: string, log: Logger): Promise<unknown> =>
  office
    .execute(SYSTEM_ACTOR, (m, c) => transitionTask(m, { id: task.id, to: "blocked", reason }, c))
    .then(() => {
      log.warn({ taskId: task.id, reason }, "task blocked by the scheduler");
    })
    .catch((error: unknown) => {
      log.warn({ taskId: task.id, err: errorMessage(error) }, "task could not be blocked");
    });

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
    const plan = planSessionStarts(
      office.model,
      config.scheduler.maxConcurrentSessions,
      config.services.enabled,
    );
    log.debug(
      {
        starts: plan.starts.length,
        skipped: plan.skipped,
        exhausted: plan.exhausted,
        capacity: plan.capacity,
        active: office.model.activeSessions.size,
        max: config.scheduler.maxConcurrentSessions,
      },
      "scheduler tick",
    );
    for (const spent of plan.exhausted) {
      const task = office.model.tasks.get(spent.taskId);
      if (task !== undefined && !stopped) {
        await block(office, task, spent.reason, log);
      }
    }
    for (const start of plan.starts) {
      if (stopped) {
        break;
      }
      log.info({ taskId: start.taskId, agentId: start.agentId }, "scheduling session");
      await sessions.start(start.taskId, start.agentId, start.mode).catch((error: unknown) => {
        log.error({ taskId: start.taskId, err: errorMessage(error) }, "session did not start");
      });
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
  const onCancelled = async (taskId: Task["id"]): Promise<void> => {
    void sessions.stopTask(taskId);
    const cancelled = office.model.tasks.get(taskId);
    if (cancelled === undefined) {
      return;
    }
    for (const dependent of dependentsOf(office.model, cancelled)) {
      if (WAITING_STATUSES.has(dependent.status)) {
        await block(
          office,
          dependent,
          `builds on "${cancelled.title}", which was cancelled; re-plan or cancel it too`,
          log,
        );
      }
    }
  };
  const onEvent = async (event: StoredEvent): Promise<void> => {
    if (event.type === "task.status_changed" && event.payload.to === "cancelled") {
      await onCancelled(event.payload.taskId);
    }
    tick();
  };
  const following = followEvents(
    office,
    [
      "task.created",
      "task.assigned",
      "task.reviewer_assigned",
      "task.status_changed",
      "task.review_waived",
      "session.ended",
      "agent.updated",
    ],
    onEvent,
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
