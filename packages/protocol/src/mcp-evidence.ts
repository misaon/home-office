import { z } from "zod";
import { ATTACHMENTS_MAX, AttachmentName, CHAT_OUTBOX_DIR } from "./attachments.ts";
import { REPORT_MAX } from "./domain.ts";
import { TaskId } from "./ids.ts";
import {
  EvidenceBlocker,
  EvidenceFidelity,
  EvidenceVerdict,
  MANDATE_CRITERIA_MAX,
  PROOF_MAX,
  VIA_MAX,
} from "./mandate.ts";

export const CRITERIA_MAX = 12;

export const FIDELITY_FIELDS = {
  fidelity: EvidenceFidelity.describe(
    "live: you exercised the running application, the one the office started or the one you started with the environment's run command; substitute: you served a stand-in page, a mock or extracted markup instead; static: you judged from code, templates, build output or tests alone",
  ),
  via: z
    .string()
    .min(1)
    .max(VIA_MAX)
    .optional()
    .describe("The exact command you ran or the URL you opened for this judgement"),
  blocker: EvidenceBlocker.optional().describe(
    "Required when fidelity is not live: not_prepared when the briefing describes no way to run the application; not_attempted when a way existed and you did not use it, and you say why; attempt_failed when you tried the described way and it failed, and you say how",
  ),
  files: z
    .array(AttachmentName)
    .max(ATTACHMENTS_MAX)
    .prefault([])
    .describe(
      `Screenshots in ${CHAT_OUTBOX_DIR} that back this judgement, by name; each must also be listed in the call's files`,
    ),
};

export const CriterionJudgement = z.object({
  index: z.int().positive().describe("The criterion's number as the briefing lists it, from 1"),
  verdict: EvidenceVerdict.describe(
    "pass when you exercised it and it holds; fail when it does not; not_checked when your stage does not cover it and you say why",
  ),
  evidence: z
    .string()
    .min(1)
    .max(PROOF_MAX)
    .describe("What you ran or opened and what you observed, specific enough to repeat"),
  ...FIDELITY_FIELDS,
});
export type CriterionJudgement = z.infer<typeof CriterionJudgement>;

export const HoReviewInput = z.object({
  verdict: z.enum(["approve", "request_changes"]),
  findings: z
    .string()
    .min(1)
    .max(4000)
    .describe("Numbered findings with file:line references, or a short approval note."),
  criteria: z
    .array(CriterionJudgement)
    .max(CRITERIA_MAX)
    .describe(
      "One entry per acceptance criterion of the task, by its number. The office keeps them as evidence on the commit you reviewed; approve is refused while any criterion fails, and while a pass rests on a substitute or on code alone although the office started the application.",
    ),
  files: z
    .array(AttachmentName)
    .max(ATTACHMENTS_MAX)
    .prefault([])
    .describe(
      `Screenshots or other files for the human, written into ${CHAT_OUTBOX_DIR}; names only, no paths. Name the ones that back a criterion in that criterion's files too.`,
    ),
});
export type HoReviewInput = z.infer<typeof HoReviewInput>;

export const HoVerifyInput = z.object({
  verdict: z
    .enum(["pass", "fail"])
    .describe("pass when every condition holds on the integrated result; fail otherwise"),
  criteria: z
    .array(CriterionJudgement)
    .max(MANDATE_CRITERIA_MAX)
    .describe("One entry per condition of the request, by its number in the briefing"),
  taskCriteria: z
    .array(CriterionJudgement.extend({ taskId: TaskId }))
    .max(CRITERIA_MAX * 4)
    .prefault([])
    .describe(
      "Only when the briefing lists task criteria that still lack independent evidence: one entry per such criterion, with the task id and the criterion's number in that task",
    ),
  summary: z
    .string()
    .min(1)
    .max(REPORT_MAX)
    .describe("What you exercised, what held and what failed, for the human. Markdown."),
  files: z
    .array(AttachmentName)
    .max(ATTACHMENTS_MAX)
    .prefault([])
    .describe(
      `Screenshots or other files written into ${CHAT_OUTBOX_DIR} that back your judgements; names only, no paths`,
    ),
});
export type HoVerifyInput = z.infer<typeof HoVerifyInput>;
