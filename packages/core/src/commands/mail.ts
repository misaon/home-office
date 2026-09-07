import type {
  MailAck,
  MailConnector,
  MailItem,
  MailItemId,
  NewEvent,
  Project,
  ProjectId,
  Task,
} from "@ho/protocol";
import { notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import type { IntakeItem } from "../ports.ts";
import { err, ok } from "../result.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { bossOf } from "./shared.ts";

const BODY_MAX = 12_000;
const TITLE_MAX = 200;

/** The task brief: everything the boss (or a worker) needs to act on the issue without opening GitHub. */
export const formatMailBrief = (project: Project, item: IntakeItem): string => {
  const body = item.body.trim();
  const clipped = body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}\n\n[… truncated]` : body;
  return [
    `GitHub issue #${item.externalId} in project "${project.name}": ${item.title}`,
    item.url,
    `Opened by ${item.author === "" ? "unknown" : item.author}.${item.labels.length === 0 ? "" : ` Labels: ${item.labels.join(", ")}.`}`,
    "",
    clipped === "" ? "(no description)" : clipped,
  ].join("\n");
};

const mailTitle = (item: IntakeItem): string =>
  `Issue #${item.externalId}: ${item.title}`.slice(0, TITLE_MAX);

export const findMail = (
  model: ReadModel,
  projectId: ProjectId,
  connector: MailConnector,
  externalId: string,
): MailItem | undefined =>
  [...model.mail.values()].find(
    (m) => m.projectId === projectId && m.connector === connector && m.externalId === externalId,
  );

export type ReceivedMail = { mail: MailItem; task: Task | null; duplicate: boolean };

/**
 * A connector item becomes a mail item plus its task: a triage task for the floor's boss (Lola carries it
 * from the reception to his office), or a work task in the project's inbox when the floor has no boss.
 * Items already received (same project, connector and external id) return unchanged with `duplicate: true`.
 */
export function receiveMail(
  model: ReadModel,
  projectId: ProjectId,
  connector: MailConnector,
  item: IntakeItem,
  ctx: CommandContext,
): CommandResult<ReceivedMail> {
  const project = model.projects.get(projectId);
  if (project === undefined) {
    return err(notFound("project", projectId));
  }
  const existing = findMail(model, projectId, connector, item.externalId);
  if (existing !== undefined) {
    const task = existing.taskId === undefined ? undefined : model.tasks.get(existing.taskId);
    return ok({ events: [], value: { mail: existing, task: task ?? null, duplicate: true } });
  }
  const boss = bossOf(model, project.id);
  const shared = {
    id: ctx.ids.task(),
    title: mailTitle(item),
    brief: formatMailBrief(project, item),
    reviewRounds: 0,
    notes: [],
    source: { kind: "mail", connector, externalId: item.externalId },
    artifacts: {},
    priority: "normal",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  } satisfies Partial<Task>;
  const task: Task =
    boss !== undefined
      ? {
          ...shared,
          projectId: project.id,
          kind: "triage",
          status: "assigned",
          assigneeId: boss.id,
        }
      : { ...shared, projectId: project.id, kind: "work", status: "inbox" };
  const mail: MailItem = {
    id: ctx.ids.mail(),
    projectId: project.id,
    connector,
    externalId: item.externalId,
    url: item.url,
    title: item.title.slice(0, 300),
    author: item.author.slice(0, 100),
    labels: item.labels.map((l) => l.slice(0, 50)),
    receivedAt: ctx.now,
    taskId: task.id,
    acks: [],
  };
  const events: NewEvent[] = [
    { type: "mail.received", actor: ctx.actor, payload: { mail } },
    { type: "task.created", actor: ctx.actor, payload: { task } },
  ];
  return ok({ events, value: { mail, task, duplicate: false } });
}

export function acknowledgeMail(
  model: ReadModel,
  mailId: MailItemId,
  ack: Omit<MailAck, "at">,
  ctx: CommandContext,
): CommandResult<MailItem> {
  const mail = model.mail.get(mailId);
  if (mail === undefined) {
    return err(notFound("mail", mailId));
  }
  const stamped: MailAck = { ...ack, at: ctx.now };
  return ok({
    events: [{ type: "mail.acknowledged", actor: ctx.actor, payload: { mailId, ack: stamped } }],
    value: { ...mail, acks: [...mail.acks, stamped] },
  });
}

/** Enough of the model to follow a task back to its mail; the UI's immutable snapshot fits too. */
export type MailLookup = {
  tasks: ReadonlyMap<Task["id"], Task>;
  mail: ReadonlyMap<MailItemId, MailItem>;
};

/** The mail item behind a task: its own, or the one behind the triage task that delegated it. */
export function mailForTask(model: MailLookup, task: Task): MailItem | undefined {
  let current: Task | undefined = task;
  for (let depth = 0; current !== undefined && depth < 4; depth += 1) {
    const id: Task["id"] = current.id;
    if (current.source.kind === "mail") {
      return [...model.mail.values()].find((m) => m.taskId === id);
    }
    if (current.source.kind !== "delegation" || current.source.parentTaskId === undefined) {
      return undefined;
    }
    current = model.tasks.get(current.source.parentTaskId);
  }
  return undefined;
}
