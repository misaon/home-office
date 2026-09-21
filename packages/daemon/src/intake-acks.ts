import { mailForTask, type ReadModel } from "@ho/core";
import {
  clip,
  type MailAck,
  type MailItem,
  type MandateId,
  type MandateStatus,
  type Project,
  type Task,
} from "@ho/protocol";
import { describeOutcome } from "./outcome.ts";

const DETAIL_MAX = 3000;
const REQUEST_MAX = 1500;

export type SourceAck = { project: Project; mail: MailItem; ack: Omit<MailAck, "at"> };

const owner = (model: ReadModel, task: Task): { project: Project; mail: MailItem } | null => {
  const mail = mailForTask(model, task);
  const project = mail === undefined ? undefined : model.projects.get(mail.projectId);
  return mail === undefined || project === undefined ? null : { project, mail };
};

export function delegationAck(model: ReadModel, task: Task): SourceAck | null {
  if (task.source.kind !== "delegation" || task.source.parentTaskId === undefined) {
    return null;
  }
  const found = owner(model, task);
  if (found === null) {
    return null;
  }
  const assignee = task.assigneeId === undefined ? undefined : model.agents.get(task.assigneeId);
  return {
    ...found,
    ack: {
      outcome: "delegated",
      detail: `"${task.title}"${assignee === undefined ? " (waiting in the project inbox)" : ` → ${assignee.name}`}`,
    },
  };
}

export function outcomeAck(
  model: ReadModel,
  taskId: Task["id"],
  to: Task["status"],
  reason: string | undefined,
): SourceAck | null {
  if (to !== "done" && to !== "blocked" && to !== "failed") {
    return null;
  }
  const task = model.tasks.get(taskId);
  if (task === undefined || task.mandateId !== undefined || task.kind === "triage") {
    return null;
  }
  const found = owner(model, task);
  if (found === null) {
    return null;
  }
  const detail = describeOutcome(task, to === "done" ? reason : undefined, DETAIL_MAX);
  return {
    ...found,
    ack: {
      outcome: to,
      detail: detail === "" ? `Task "${task.title}" is ${task.status}.` : detail,
    },
  };
}

export function mandateAck(
  model: ReadModel,
  mandateId: MandateId,
  to: MandateStatus,
  reason: string | undefined,
): SourceAck | null {
  if (to !== "fulfilled" && to !== "blocked") {
    return null;
  }
  const mandate = model.mandates.get(mandateId);
  const root = mandate === undefined ? undefined : model.tasks.get(mandate.rootTaskId);
  const found = root === undefined ? null : owner(model, root);
  if (mandate === undefined || found === null) {
    return null;
  }
  const { prUrl, branch } = mandate.artifacts;
  const detail =
    to === "fulfilled"
      ? [
          `Every condition of the request holds on the combined result${mandate.acceptance.length === 0 ? "" : ` (${String(mandate.acceptance.length)} verified)`}.`,
          prUrl === undefined ? "" : `Pull request: ${prUrl}`,
          branch === undefined ? "" : `Branch: ${branch}`,
        ]
          .filter((line) => line !== "")
          .join("\n")
      : `The request is blocked${reason === undefined ? "" : `: ${clip(reason, REQUEST_MAX)}`}`;
  return {
    ...found,
    ack: { outcome: to === "fulfilled" ? "done" : "blocked", detail: clip(detail, DETAIL_MAX) },
  };
}
