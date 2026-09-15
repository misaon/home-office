import {
  type MailAck,
  type MailConnector,
  type MailItem,
  type MailItemId,
  type NewEvent,
  notFound,
  type Project,
  type ProjectId,
  type Task,
} from "@ho/protocol";
import { bossOf, findMail } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import type { IntakeItem } from "../ports.ts";
import { type CommandContext, type CommandResult, entity, err, ok } from "../result.ts";
import { TITLE_MAX, withProject } from "./shared.ts";
import { newTask, readTask } from "./tasks.ts";

const BODY_MAX = 12_000;

/** The task brief: everything the boss (or a worker) needs to act on the issue without opening GitHub. */
const formatMailBrief = (project: Project, item: IntakeItem): string => {
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
  return withProject(model, projectId, (project): CommandResult<ReceivedMail> => {
    const existing = findMail(model, projectId, connector, item.externalId);
    if (existing !== undefined) {
      return ok({
        events: [],
        read: (m) => ({
          mail: entity(m.mail, existing.id),
          task: existing.taskId === undefined ? null : (m.tasks.get(existing.taskId) ?? null),
          duplicate: true,
        }),
      });
    }
    const boss = bossOf(model, project.id);
    const task = newTask(ctx, {
      projectId: project.id,
      kind: boss === undefined ? "work" : "triage",
      title: `Issue #${item.externalId}: ${item.title}`.slice(0, TITLE_MAX),
      brief: formatMailBrief(project, item),
      source: { kind: "mail", connector, externalId: item.externalId },
      assigneeId: boss?.id,
    });
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
    return ok({
      events,
      read: (m) => ({
        mail: entity(m.mail, mail.id),
        task: readTask(task.id)(m),
        duplicate: false,
      }),
    });
  });
}

export function acknowledgeMail(
  model: ReadModel,
  mailId: MailItemId,
  ack: Omit<MailAck, "at">,
  ctx: CommandContext,
): CommandResult<MailItem> {
  if (!model.mail.has(mailId)) {
    return err(notFound("mail", mailId));
  }
  return ok({
    events: [
      {
        type: "mail.acknowledged",
        actor: ctx.actor,
        payload: { mailId, ack: { ...ack, at: ctx.now } },
      },
    ],
    read: (m) => entity(m.mail, mailId),
  });
}
