import { bossOf, postAgentMessage } from "@ho/core";
import type { Agent, StoredEvent, Task, TaskStatus } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import type { OfficeGate } from "./office-gate.ts";

const SYSTEM = { kind: "system" } as const;
const REPORT_MAX = 600;
const QUESTION_PREFIX = "question:";

type Model = Office["model"];

const nameOf = (model: Model, id: Agent["id"] | undefined): string =>
  id === undefined ? "somebody" : (model.agents.get(id)?.name ?? "a colleague");

const quote = (task: Task): string => `“${task.title}”`;

const outcome = (task: Task, reason: string | undefined): string => {
  const parts = [
    task.artifacts.report === undefined ? null : task.artifacts.report.slice(0, REPORT_MAX),
    reason === undefined || reason === "" || reason === task.artifacts.report ? null : reason,
    task.artifacts.branch === undefined ? null : `Branch: ${task.artifacts.branch}`,
    task.artifacts.prUrl === undefined ? null : `Pull request: ${task.artifacts.prUrl}`,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? "" : `\n${parts.join("\n")}`;
};

/** What Andrew says when a task he created changes hands or state; null for moments he stays quiet about. */
function statusLine(
  model: Model,
  boss: Agent,
  task: Task,
  to: TaskStatus,
  reason: string | undefined,
): string | null {
  if (task.kind === "triage") {
    return to === "failed" || to === "blocked"
      ? `I could not process your message: ${reason ?? to}.`
      : null;
  }
  const worker = nameOf(model, task.assigneeId);
  const mine = task.assigneeId === boss.id;
  if (to === "in_progress") {
    return mine ? `I am working on ${quote(task)}.` : `${worker} is working on ${quote(task)}.`;
  }
  if (to === "review") {
    return `${mine ? "I" : worker} finished ${quote(task)}; ${nameOf(model, task.reviewerId)} is reviewing it.`;
  }
  if (to === "assigned") {
    return reason === "changes requested"
      ? `${nameOf(model, task.reviewerId)} asked for changes on ${quote(task)}; it is back with ${mine ? "me" : worker}.`
      : null;
  }
  if (to === "done") {
    return `${quote(task)} is done.${outcome(task, reason)}`;
  }
  if (to === "blocked") {
    // A question is already in the chat as the colleague's own message; only other blocks are reported.
    return reason?.startsWith(QUESTION_PREFIX) === true
      ? null
      : `${quote(task)} is blocked${reason === undefined ? "" : `: ${reason}`}.`;
  }
  if (to === "failed") {
    return `${quote(task)} failed${reason === undefined ? "" : `: ${reason}`}.`;
  }
  return null;
}

/** Whether finished work walks back to the boss before he speaks: somebody else did it and it just ended. */
const walksBack = (boss: Agent, task: Task, to: TaskStatus): boolean =>
  task.kind === "work" &&
  task.assigneeId !== undefined &&
  task.assigneeId !== boss.id &&
  (to === "done" || to === "blocked");

/**
 * The boss's voice in the floor's chat (D23): deterministic status lines when he delegates, when work starts,
 * goes to review, comes back or ends. Finished work first walks back to his office while somebody watches.
 */
export function startBossVoice(
  office: Office,
  gate: OfficeGate,
  log: Logger,
): { stop: () => Promise<void> } {
  const controller = new AbortController();
  const say = async (boss: Agent, text: string, taskId: Task["id"]): Promise<void> => {
    await office
      .execute(SYSTEM, (m, ctx) => postAgentMessage(m, boss.id, text, taskId, ctx))
      .catch((error: unknown) => {
        log.warn(
          { err: error instanceof Error ? error.message : String(error) },
          "boss status message failed",
        );
      });
  };
  const onCreated = async (task: Task): Promise<void> => {
    if (task.kind !== "work" || task.source.kind !== "delegation") {
      return;
    }
    const boss = bossOf(office.model, task.projectId);
    if (boss === undefined || task.source.byAgentId !== boss.id) {
      return;
    }
    const text =
      task.assigneeId === undefined
        ? `${quote(task)} waits in the inbox for an assignee.`
        : task.assigneeId === boss.id
          ? `I will take care of ${quote(task)} myself.`
          : `I have handed ${quote(task)} to ${nameOf(office.model, task.assigneeId)}.`;
    await say(boss, text, task.id);
  };
  const onStatus = async (
    event: Extract<StoredEvent, { type: "task.status_changed" }>,
  ): Promise<void> => {
    const task = office.model.tasks.get(event.payload.taskId);
    const boss = task === undefined ? undefined : bossOf(office.model, task.projectId);
    if (task === undefined || boss === undefined) {
      return;
    }
    const text = statusLine(office.model, boss, task, event.payload.to, event.payload.reason);
    if (text === null) {
      return;
    }
    if (walksBack(boss, task, event.payload.to)) {
      await gate.waitFor(task.id, event.at);
    }
    // Artifacts (branch, PR) land right after the status change; re-read so the line carries them.
    const fresh = office.model.tasks.get(task.id) ?? task;
    await say(
      boss,
      event.payload.to === "done"
        ? `${quote(fresh)} is done.${outcome(fresh, event.payload.reason)}`
        : text,
      task.id,
    );
  };
  const pending = new Set<Promise<void>>();
  const track = (work: Promise<void>): void => {
    const done = work
      .catch((error: unknown) => {
        log.warn({ err: String(error) }, "boss voice failed");
      })
      .finally(() => {
        pending.delete(done);
      });
    pending.add(done);
  };
  const listening = (async () => {
    for await (const event of office.store.subscribe(
      { types: ["task.created", "task.status_changed"] },
      controller.signal,
    )) {
      if (event.type === "task.created") {
        track(onCreated(event.payload.task));
      } else if (event.type === "task.status_changed") {
        track(onStatus(event));
      }
    }
  })().catch((error: unknown) => {
    log.error({ err: String(error) }, "boss voice subscription failed");
  });
  return {
    stop: async () => {
      controller.abort();
      gate.close();
      await listening;
      await Promise.allSettled(pending);
    },
  };
}
