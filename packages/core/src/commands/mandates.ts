import {
  type Attachment,
  type Baseline,
  type CriterionOrigin,
  compact,
  conflict,
  type Evidence,
  type Mandate,
  type MandateAbandonInput,
  type MandateArtifacts,
  type MandateCriterion,
  type MandateId,
  type MandateStatus,
  type NewEvent,
  notFound,
  type Task,
} from "@ho/protocol";
import { tasksOfMandate } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, entity, err, ok } from "../result.ts";
import { statusChange } from "./shared.ts";
import { canTransition } from "./tasks.ts";

const readMandate =
  (id: MandateId) =>
  (model: ReadModel): Mandate =>
    entity(model.mandates, id);

const withMandate = <T>(
  model: ReadModel,
  mandateId: MandateId,
  then: (mandate: Mandate) => CommandResult<T>,
): CommandResult<T> => {
  const mandate = model.mandates.get(mandateId);
  return mandate === undefined ? err(notFound("mandate", mandateId)) : then(mandate);
};

export const wholeRequestNeedsConditions = (
  model: ReadModel,
  task: Task,
): task is Task & { mandateId: MandateId } =>
  task.mandateId !== undefined &&
  tasksOfMandate(model, { id: task.mandateId }).filter((other) => other.kind === "work").length > 1;

export const attachmentsNamed = (
  attachments: readonly Attachment[],
  names: readonly string[],
): Attachment[] => attachments.filter((attachment) => names.includes(attachment.name));

export const evidenceOf = (
  ctx: CommandContext,
  fields: Omit<Evidence, "at" | "by" | "files"> & { files?: Evidence["files"] },
): Evidence => ({ at: ctx.now, by: ctx.actor, ...fields, files: fields.files ?? [] });

export const evidenceEvent = (
  ctx: CommandContext,
  mandateId: MandateId,
  evidence: Evidence,
): NewEvent => ({
  type: "mandate.evidence_recorded",
  actor: ctx.actor,
  payload: { mandateId, evidence },
});

export function recordEvidence(
  model: ReadModel,
  mandateId: MandateId,
  entries: readonly Evidence[],
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, () =>
    ok({
      events: entries.map((evidence) => evidenceEvent(ctx, mandateId, evidence)),
      read: readMandate(mandateId),
    }),
  );
}

export function stateAcceptance(
  model: ReadModel,
  mandateId: MandateId,
  texts: readonly string[],
  origin: CriterionOrigin,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, () => {
    const acceptance: MandateCriterion[] = texts.map((text) => ({ text, origin }));
    return ok({
      events: [
        { type: "mandate.acceptance_stated", actor: ctx.actor, payload: { mandateId, acceptance } },
      ],
      read: readMandate(mandateId),
    });
  });
}

export const mandateStatusEvent = (
  ctx: CommandContext,
  mandate: Mandate,
  to: MandateStatus,
  reason?: string,
): NewEvent => ({
  type: "mandate.status_changed",
  actor: ctx.actor,
  payload: { mandateId: mandate.id, from: mandate.status, to, ...compact({ reason }) },
});

export function changeMandateStatus(
  model: ReadModel,
  mandateId: MandateId,
  to: MandateStatus,
  reason: string | undefined,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, (mandate) =>
    ok({
      events: mandate.status === to ? [] : [mandateStatusEvent(ctx, mandate, to, reason)],
      read: readMandate(mandateId),
    }),
  );
}

export function openMandateRound(
  model: ReadModel,
  mandateId: MandateId,
  reason: string,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, (mandate) =>
    ok({
      events: [
        {
          type: "mandate.round_opened",
          actor: ctx.actor,
          payload: { mandateId, round: mandate.round + 1, reason },
        },
      ],
      read: readMandate(mandateId),
    }),
  );
}

export function patchMandateArtifacts(
  model: ReadModel,
  mandateId: MandateId,
  artifacts: Partial<MandateArtifacts>,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, (mandate) =>
    ok({
      events: [
        {
          type: "mandate.artifacts_changed",
          actor: ctx.actor,
          payload: { mandateId, artifacts: { ...mandate.artifacts, ...compact(artifacts) } },
        },
      ],
      read: readMandate(mandateId),
    }),
  );
}

export function recordBaseline(
  model: ReadModel,
  mandateId: MandateId,
  baseline: Baseline,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, mandateId, () =>
    ok({
      events: [
        { type: "mandate.baseline_recorded", actor: ctx.actor, payload: { mandateId, baseline } },
      ],
      read: readMandate(mandateId),
    }),
  );
}

export function abandonMandate(
  model: ReadModel,
  input: MandateAbandonInput,
  ctx: CommandContext,
): CommandResult<Mandate> {
  return withMandate(model, input.id, (mandate) => {
    if (ctx.actor.kind !== "human") {
      return err(conflict("only the human abandons a request"));
    }
    if (mandate.status === "fulfilled" || mandate.status === "abandoned") {
      return err(conflict(`the request is already ${mandate.status}`));
    }
    const reason = input.reason?.trim();
    const events: NewEvent[] = tasksOfMandate(model, mandate)
      .filter((task) => canTransition(task.status, "cancelled"))
      .map((task) => statusChange(ctx, task, "cancelled", "the request was abandoned"));
    events.push(
      mandateStatusEvent(
        ctx,
        mandate,
        "abandoned",
        reason === undefined || reason === "" ? undefined : reason,
      ),
    );
    return ok({ events, read: readMandate(mandate.id) });
  });
}
