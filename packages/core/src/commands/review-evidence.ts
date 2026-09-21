import {
  type Attachment,
  compact,
  type CriterionJudgement,
  type NewEvent,
  type Task,
} from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import type { CommandContext } from "../result.ts";
import { attachmentsNamed, evidenceEvent, evidenceOf } from "./mandates.ts";

export const reviewEvidence = (
  model: ReadModel,
  ctx: CommandContext,
  task: Task,
  judgements: readonly CriterionJudgement[],
  attachments: readonly Attachment[],
): NewEvent[] => {
  const { mandateId } = task;
  const { commit } = task.artifacts;
  if (mandateId === undefined || commit === undefined || !model.mandates.has(mandateId)) {
    return [];
  }
  return judgements.map((judgement) =>
    evidenceEvent(
      ctx,
      mandateId,
      evidenceOf(ctx, {
        taskId: task.id,
        commit,
        criterion: judgement.index - 1,
        method: "review",
        verdict: judgement.verdict,
        proof: judgement.evidence,
        fidelity: judgement.fidelity,
        ...compact({ via: judgement.via, blocker: judgement.blocker }),
        files: attachmentsNamed(attachments, judgement.files),
      }),
    ),
  );
};
