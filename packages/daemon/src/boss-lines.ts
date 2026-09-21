import { reviewChain, tasksOfMandate } from "@ho/core";
import {
  type Agent,
  isMandateOpen,
  isQuestionReason,
  type Mandate,
  type Project,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import type { Office } from "./office.ts";
import { outcomeOf } from "./outcome.ts";
import { formatDuration, timingOf } from "./task-timing.ts";
import { bold, pullRequestLink, quoteTitle, type Voice, voiceFor } from "./voice.ts";

const REPORT_MAX = 600;

type Model = Office["model"];

export const voiceOf = (model: Model, projectId: Project["id"]): Voice =>
  voiceFor(model.projects.get(projectId)?.language ?? "en");

const nameOf = (model: Model, voice: Voice, id: Agent["id"] | undefined): string =>
  id === undefined ? voice.somebody : (model.agents.get(id)?.name ?? voice.colleague);

const quote = (task: Task): string => quoteTitle(task.title);

const whoWorks = (model: Model, voice: Voice, id: Agent["id"] | undefined): string => {
  const agent = id === undefined ? undefined : model.agents.get(id);
  return agent === undefined
    ? bold(nameOf(model, voice, id))
    : `${bold(agent.name)} (${voice.role(agent.role)} · \`${agent.model}\` · ${voice.effort(agent.effort)})`;
};

const mandateTaskDone = (
  model: Model,
  voice: Voice,
  mandate: Mandate,
  task: Task,
): string | null => {
  if (!isMandateOpen(mandate.status)) {
    return null;
  }
  const work = tasksOfMandate(model, mandate).filter((other) => other.kind === "work");
  if (work.length <= 1) {
    return null;
  }
  const remaining = work.filter(
    (other) => other.id !== task.id && other.status !== "done" && other.status !== "cancelled",
  ).length;
  return remaining === 0
    ? voice.taskDoneAllDone(quote(task))
    : voice.taskDoneRemaining(quote(task), remaining);
};

const doneLines = (
  model: Model,
  voice: Voice,
  task: Task,
  reason: string | undefined,
  at: string,
): string | null => {
  const mandate = task.mandateId === undefined ? undefined : model.mandates.get(task.mandateId);
  if (mandate !== undefined) {
    return mandateTaskDone(model, voice, mandate, task);
  }
  const outcome = outcomeOf(task, reason, REPORT_MAX);
  const timing = timingOf(model, task, at);
  return [
    voice.taskDone(quote(task)),
    voice.timing(
      formatDuration(timing.sinceRequestMs),
      timing.sessions,
      formatDuration(timing.agentMs),
      0,
    ),
    outcome.account === "" ? "" : `\n${outcome.account}\n`,
    outcome.prUrl === null ? "" : voice.pullRequest(outcome.prUrl),
    outcome.branch === null ? "" : voice.branch(outcome.branch),
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export function statusLine(
  model: Model,
  voice: Voice,
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
      ? voice.triageNeedsYou(quote(task), reason ?? to)
      : voice.couldNotProcess(reason ?? to);
  }
  if (task.kind === "plan") {
    return to === "failed" || (to === "blocked" && !isQuestionReason(reason))
      ? voice.planFailed(bold(nameOf(model, voice, task.assigneeId)), quote(task), reason ?? to)
      : null;
  }
  if (task.kind === "verify") {
    return null;
  }
  const worker = bold(nameOf(model, voice, task.assigneeId));
  const mine = task.assigneeId === boss.id;
  if (to === "in_progress") {
    return mine ? null : voice.working(whoWorks(model, voice, task.assigneeId), quote(task));
  }
  if (to === "review") {
    return voice.finished(
      mine ? null : worker,
      quote(task),
      task.artifacts.prUrl === undefined ? null : pullRequestLink(task.artifacts.prUrl),
      bold(nameOf(model, voice, task.reviewerId)),
    );
  }
  if (to === "assigned") {
    return reason === "changes requested"
      ? voice.changesRequested(
          bold(nameOf(model, voice, task.reviewerId)),
          quote(task),
          mine ? null : worker,
        )
      : null;
  }
  if (to === "done") {
    return doneLines(model, voice, task, reason, at);
  }
  if (to === "blocked") {
    return isQuestionReason(reason) ? null : voice.taskBlocked(quote(task), reason);
  }
  if (to === "failed") {
    return voice.taskFailed(quote(task), reason);
  }
  return null;
}

export const createdLine = (
  model: Model,
  voice: Voice,
  boss: Agent,
  project: Project,
  task: Task,
): string | null => {
  if (task.source.kind !== "delegation" || task.assigneeId === boss.id) {
    return null;
  }
  const byBoss = task.source.byAgentId === boss.id;
  if (task.kind === "plan") {
    return byBoss
      ? voice.askedToPlan(bold(nameOf(model, voice, task.assigneeId)), quote(task))
      : null;
  }
  if (task.kind !== "work") {
    return null;
  }
  if (task.assigneeId === undefined) {
    return voice.waitsInInbox(quote(task));
  }
  const reviewers = reviewChain(model, task).map((reviewer) => bold(reviewer.name));
  const pullRequest = project.publish.mode === "pull-request" || task.publish === "pull-request";
  const to = bold(nameOf(model, voice, task.assigneeId));
  return byBoss
    ? voice.handed(quote(task), to, reviewers, pullRequest)
    : voice.handedBy(
        bold(nameOf(model, voice, task.source.byAgentId)),
        quote(task),
        to,
        reviewers,
        pullRequest,
      );
};

export const nextStageLine = (
  model: Model,
  voice: Voice,
  task: Task,
  reviewerId: Agent["id"] | null,
): string | null => {
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
  return voice.approvedNext(
    bold(nameOf(model, voice, verdict.author.agentId)),
    quote(task),
    bold(nameOf(model, voice, reviewerId)),
  );
};
