import { bossOf, postAgentMessage } from "@ho/core";
import {
  type Agent,
  errorMessage,
  isQuestionReason,
  ROLE_TITLE,
  type StoredEvent,
  SYSTEM_ACTOR,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { mandateStatusLine, pullRequestLink, roundLine } from "./mandate-voice.ts";
import { followEvents, type Office } from "./office.ts";
import type { OfficeGate } from "./office-gate.ts";
import { outcomeOf } from "./outcome.ts";
import { formatDuration, timingOf } from "./task-timing.ts";

const REPORT_MAX = 600;

type Model = Office["model"];

const nameOf = (model: Model, id: Agent["id"] | undefined): string =>
  id === undefined ? "somebody" : (model.agents.get(id)?.name ?? "a colleague");

const quote = (task: Task): string => `**“${task.title}”**`;

const bold = (name: string): string => `**${name}**`;

const whoWorks = (model: Model, id: Agent["id"] | undefined): string => {
  const agent = id === undefined ? undefined : model.agents.get(id);
  return agent === undefined
    ? bold(nameOf(model, id))
    : `${bold(agent.name)} (${ROLE_TITLE[agent.role]} · \`${agent.model}\` · ${agent.effort} effort)`;
};

const pullRequestNote = (task: Task): string =>
  task.artifacts.prUrl === undefined ? "" : ` (${pullRequestLink(task.artifacts.prUrl)})`;

const doneLines = (model: Model, task: Task, reason: string | undefined, at: string): string => {
  const outcome = outcomeOf(task, reason, REPORT_MAX);
  if (task.mandateId !== undefined) {
    return [`✅ ${quote(task)} is done.`, outcome.account === "" ? "" : `\n${outcome.account}`]
      .filter((line) => line !== "")
      .join("\n");
  }
  const timing = timingOf(model, task, at);
  return [
    `✅ ${quote(task)} is done.`,
    `⏱️ From the request to here: ${bold(formatDuration(timing.sinceRequestMs))}; ${String(timing.sessions)} session${timing.sessions === 1 ? "" : "s"} spent ${formatDuration(timing.agentMs)} on it.`,
    outcome.account === "" ? "" : `\n${outcome.account}\n`,
    outcome.prUrl === null ? "" : `🔗 ${pullRequestLink(outcome.prUrl)}`,
    outcome.branch === null ? "" : `🌿 Branch \`${outcome.branch}\``,
  ]
    .filter((line) => line !== "")
    .join("\n");
};

function statusLine(
  model: Model,
  boss: Agent,
  task: Task,
  to: TaskStatus,
  reason: string | undefined,
  at: string,
): string | null {
  if (task.kind === "triage") {
    if (to !== "failed" && to !== "blocked") {
      return null;
    }
    return task.source.kind === "mandate"
      ? `🚧 ${quote(task)} needs you: ${reason ?? to}`
      : `❌ I could not process your message: ${reason ?? to}.`;
  }
  if (task.kind === "plan") {
    return to === "failed" || (to === "blocked" && !isQuestionReason(reason))
      ? `❌ ${bold(nameOf(model, task.assigneeId))} could not finish planning ${quote(task)}: ${reason ?? to}.`
      : null;
  }
  if (task.kind === "verify") {
    return null;
  }
  const worker = bold(nameOf(model, task.assigneeId));
  const mine = task.assigneeId === boss.id;
  if (to === "in_progress") {
    return mine ? null : `🔧 ${whoWorks(model, task.assigneeId)} is working on ${quote(task)}.`;
  }
  if (to === "review") {
    return `🔍 ${mine ? "I" : worker} finished ${quote(task)}${pullRequestNote(task)}; ${bold(nameOf(model, task.reviewerId))} is reviewing it.`;
  }
  if (to === "assigned") {
    return reason === "changes requested"
      ? `↩️ ${bold(nameOf(model, task.reviewerId))} asked for changes on ${quote(task)}; it is back with ${mine ? "me" : worker}.`
      : null;
  }
  if (to === "done") {
    return doneLines(model, task, reason, at);
  }
  if (to === "blocked") {
    return isQuestionReason(reason)
      ? null
      : `🚧 ${quote(task)} is blocked${reason === undefined ? "" : `: ${reason}`}.`;
  }
  if (to === "failed") {
    return `❌ ${quote(task)} failed${reason === undefined ? "" : `: ${reason}`}.`;
  }
  return null;
}

const walksBack = (boss: Agent, task: Task, to: TaskStatus, reason: string | undefined): boolean =>
  task.kind === "work" &&
  task.assigneeId !== undefined &&
  task.assigneeId !== boss.id &&
  (to === "done" || (to === "blocked" && !isQuestionReason(reason)));

const createdLine = (model: Model, boss: Agent, task: Task): string | null => {
  if (task.source.kind !== "delegation" || task.assigneeId === boss.id) {
    return null;
  }
  const byBoss = task.source.byAgentId === boss.id;
  if (task.kind === "plan") {
    return byBoss
      ? `🗺️ I have asked ${bold(nameOf(model, task.assigneeId))} to plan ${quote(task)}.`
      : null;
  }
  if (task.kind !== "work") {
    return null;
  }
  if (task.assigneeId === undefined) {
    return `📥 ${quote(task)} waits in the inbox for an assignee.`;
  }
  return byBoss
    ? `👉 I have handed ${quote(task)} to ${bold(nameOf(model, task.assigneeId))}.`
    : `👉 ${bold(nameOf(model, task.source.byAgentId))} handed ${quote(task)} to ${bold(nameOf(model, task.assigneeId))}.`;
};

const nextStageLine = (model: Model, task: Task, reviewerId: Agent["id"] | null): string | null => {
  if (task.status !== "review" || reviewerId === null) {
    return null;
  }
  const report = task.notes.findLast((note) => note.kind === "report");
  const verdict = task.notes.findLast(
    (note) => note.kind === "review" && (report === undefined || note.at >= report.at),
  );
  if (verdict?.author.kind !== "agent" || !verdict.text.startsWith("approve")) {
    return null;
  }
  return `✅ ${bold(nameOf(model, verdict.author.agentId))} approved ${quote(task)}; ${bold(nameOf(model, reviewerId))} reviews it next.`;
};

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
    const boss = bossOf(office.model, task.projectId);
    const text = boss === undefined ? null : createdLine(office.model, boss, task);
    if (boss !== undefined && text !== null) {
      await say(boss, text, task.id);
    }
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
    const task = office.model.tasks.get(taskId) ?? before;
    const text = statusLine(office.model, boss, task, to, reason, event.at);
    if (text !== null) {
      await say(boss, text, task.id);
    }
  };
  const onReviewer = async (
    event: Extract<StoredEvent, { type: "task.reviewer_assigned" }>,
  ): Promise<void> => {
    const task = office.model.tasks.get(event.payload.taskId);
    const boss = task === undefined ? undefined : bossOf(office.model, task.projectId);
    const text =
      task === undefined ? null : nextStageLine(office.model, task, event.payload.reviewerId);
    if (boss !== undefined && text !== null) {
      await say(boss, text, event.payload.taskId);
    }
  };
  const onMandate = async (
    event: Extract<StoredEvent, { type: "mandate.status_changed" | "mandate.round_opened" }>,
  ): Promise<void> => {
    const mandate = office.model.mandates.get(event.payload.mandateId);
    const boss = mandate === undefined ? undefined : bossOf(office.model, mandate.projectId);
    if (mandate === undefined || boss === undefined) {
      return;
    }
    const text =
      event.type === "mandate.round_opened"
        ? roundLine(mandate, event.payload.round, event.payload.reason)
        : mandateStatusLine(
            office.model,
            mandate,
            event.payload.to,
            event.payload.reason,
            event.at,
          );
    if (text !== null) {
      await say(boss, text, mandate.rootTaskId);
    }
  };
  const following = followEvents(
    office,
    [
      "task.created",
      "task.status_changed",
      "task.reviewer_assigned",
      "mandate.status_changed",
      "mandate.round_opened",
    ],
    (event) => {
      if (event.type === "task.created") {
        return onCreated(event.payload.task);
      }
      if (event.type === "task.status_changed") {
        return onStatus(event);
      }
      if (event.type === "task.reviewer_assigned") {
        return onReviewer(event);
      }
      if (event.type === "mandate.status_changed" || event.type === "mandate.round_opened") {
        return onMandate(event);
      }
      return undefined;
    },
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
