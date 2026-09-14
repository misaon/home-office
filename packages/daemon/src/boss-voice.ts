import { bossOf, postAgentMessage } from "@ho/core";
import {
  type Agent,
  errorMessage,
  type StoredEvent,
  SYSTEM_ACTOR,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";
import type { OfficeGate } from "./office-gate.ts";
import { describeOutcome } from "./outcome.ts";

const REPORT_MAX = 600;
const QUESTION_PREFIX = "question:";

type Model = Office["model"];

const nameOf = (model: Model, id: Agent["id"] | undefined): string =>
  id === undefined ? "somebody" : (model.agents.get(id)?.name ?? "a colleague");

const quote = (task: Task): string => `“${task.title}”`;

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
    const outcome = describeOutcome(task, reason, REPORT_MAX);
    return `${quote(task)} is done.${outcome === "" ? "" : `\n${outcome}`}`;
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
const walksBack = (boss: Agent, task: Task, to: TaskStatus, reason: string | undefined): boolean =>
  task.kind === "work" &&
  task.assigneeId !== undefined &&
  task.assigneeId !== boss.id &&
  (to === "done" || (to === "blocked" && reason?.startsWith(QUESTION_PREFIX) !== true));

/**
 * The boss's voice in the floor's chat (D23): deterministic status lines when he delegates, when work starts,
 * goes to review, comes back or ends. Finished work first walks back to his office while somebody watches.
 */
export function startBossVoice(
  office: Office,
  gate: OfficeGate,
  log: Logger,
): { stop: () => Promise<void> } {
  const say = async (boss: Agent, text: string, taskId: Task["id"]): Promise<void> => {
    await office
      .execute(SYSTEM_ACTOR, (m, ctx) => postAgentMessage(m, boss.id, text, taskId, ctx))
      .catch((error: unknown) => {
        log.warn({ err: errorMessage(error) }, "boss status message failed");
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
    const { taskId, to, reason } = event.payload;
    const before = office.model.tasks.get(taskId);
    const boss = before === undefined ? undefined : bossOf(office.model, before.projectId);
    if (before === undefined || boss === undefined) {
      return;
    }
    if (walksBack(boss, before, to, reason)) {
      await gate.waitFor(before.id, event.at);
    }
    // Artifacts (branch, PR) land right after the status change; re-read so the line carries them.
    const task = office.model.tasks.get(taskId) ?? before;
    const text = statusLine(office.model, boss, task, to, reason);
    if (text !== null) {
      await say(boss, text, task.id);
    }
  };
  const following = followEvents(
    office,
    ["task.created", "task.status_changed"],
    (event) =>
      event.type === "task.created"
        ? onCreated(event.payload.task)
        : event.type === "task.status_changed"
          ? onStatus(event)
          : undefined,
    log,
    "boss voice",
  );
  return {
    stop: async () => {
      gate.close();
      await following.stop();
    },
  };
}
