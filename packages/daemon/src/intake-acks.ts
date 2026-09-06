import { mailForTask, type ReadModel } from "@ho/core";
import type { MailAck, MailItem, Project, Task } from "@ho/protocol";

const DETAIL_MAX = 3000;

/** What the office tells the source: the project that owns the mail, the item, and the acknowledgement. */
export type SourceAck = { project: Project; mail: MailItem; ack: Omit<MailAck, "at"> };

const outcomeDetail = (task: Task, reason: string | undefined): string => {
  const lines = [
    task.artifacts.prUrl === undefined ? null : `Pull request: ${task.artifacts.prUrl}`,
    task.artifacts.branch === undefined ? null : `Branch: \`${task.artifacts.branch}\``,
    reason === undefined || reason === "" ? null : reason,
    task.artifacts.report === undefined || task.artifacts.report === reason
      ? null
      : task.artifacts.report,
  ].filter((line): line is string => line !== null);
  return (
    lines.length === 0 ? `Task "${task.title}" is ${task.status}.` : lines.join("\n\n")
  ).slice(0, DETAIL_MAX);
};

const owner = (model: ReadModel, task: Task): { project: Project; mail: MailItem } | null => {
  const mail = mailForTask(model, task);
  const project = mail === undefined ? undefined : model.projects.get(mail.projectId);
  return mail === undefined || project === undefined ? null : { project, mail };
};

/** The boss delegated a mail-born triage task: tell the issue who works on what. */
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

/** A mail-born task (or one delegated from it) finished, paused or failed. */
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
  // A finished triage means the boss delegated (the children carry the outcome); only a stalled one reports.
  if (task === undefined || (task.kind === "triage" && to === "done")) {
    return null;
  }
  const found = owner(model, task);
  return found === null
    ? null
    : { ...found, ack: { outcome: to, detail: outcomeDetail(task, reason) } };
}
