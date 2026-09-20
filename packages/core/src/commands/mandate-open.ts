import type { Mandate, MandateId, MandateSource, NewEvent, Task } from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import type { CommandContext } from "../result.ts";

const mandateSourceOf = (root: Task): MandateSource => {
  const { source } = root;
  if (source.kind === "chat") {
    return { kind: "chat", messageId: source.messageId };
  }
  if (source.kind === "mail") {
    return { kind: "mail", connector: source.connector, externalId: source.externalId };
  }
  return { kind: "manual" };
};

export const openMandate = (ctx: CommandContext, id: MandateId, root: Task): NewEvent => {
  const mandate: Mandate = {
    id,
    projectId: root.projectId,
    title: root.title,
    request: root.brief.trim() === "" ? root.title : root.brief,
    source: mandateSourceOf(root),
    rootTaskId: root.id,
    acceptance: [],
    evidence: [],
    status: "open",
    round: 0,
    artifacts: { merged: [] },
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return { type: "mandate.opened", actor: ctx.actor, payload: { mandate } };
};

export type MandateAttachment = { mandateId: MandateId | undefined; events: NewEvent[] };

export const attachToMandate = (
  model: Pick<ReadModel, "tasks">,
  ctx: CommandContext,
  parentTaskId: Task["id"] | undefined,
): MandateAttachment => {
  const parent = parentTaskId === undefined ? undefined : model.tasks.get(parentTaskId);
  if (parent === undefined) {
    return { mandateId: undefined, events: [] };
  }
  if (parent.mandateId !== undefined) {
    return { mandateId: parent.mandateId, events: [] };
  }
  if (parent.kind !== "triage") {
    return { mandateId: undefined, events: [] };
  }
  const id = ctx.ids.mandate();
  return { mandateId: id, events: [openMandate(ctx, id, parent)] };
};
