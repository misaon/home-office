import { z } from "zod";
import { Attachment, ATTACHMENTS_MAX } from "./attachments.ts";
import { Actor, BRIEF_MAX, CommitSha, IsoDateTime } from "./domain.ts";
import { ChatMessageId, MandateId, ProjectId, SessionId, TaskId } from "./ids.ts";
import { MailConnector } from "./policies.ts";

export const MandateStatus = z.enum(["open", "verifying", "fulfilled", "blocked", "abandoned"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

export const isMandateOpen = (status: MandateStatus): boolean =>
  status === "open" || status === "verifying" || status === "blocked";

export const CriterionOrigin = z.enum(["stated", "request"]);
export type CriterionOrigin = z.infer<typeof CriterionOrigin>;

export const CRITERION_MAX = 500;
export const MANDATE_CRITERIA_MAX = 20;

export const MandateCriterion = z.object({
  text: z.string().min(1).max(CRITERION_MAX),
  origin: CriterionOrigin,
});
export type MandateCriterion = z.infer<typeof MandateCriterion>;

const EvidenceMethod = z.enum(["checks", "author", "review", "verification"]);

export const EvidenceVerdict = z.enum(["pass", "fail", "not_checked"]);
export type EvidenceVerdict = z.infer<typeof EvidenceVerdict>;

export const PROOF_MAX = 2000;
export const VIA_MAX = 300;

export const EvidenceFidelity = z.enum(["live", "substitute", "static"]);
export type EvidenceFidelity = z.infer<typeof EvidenceFidelity>;

export const EvidenceBlocker = z.enum(["not_prepared", "not_attempted", "attempt_failed"]);
export type EvidenceBlocker = z.infer<typeof EvidenceBlocker>;

export const Evidence = z.object({
  at: IsoDateTime,
  by: Actor,
  sessionId: SessionId.optional(),
  taskId: TaskId.optional(),
  commit: CommitSha,
  criterion: z.int().nonnegative().nullable(),
  method: EvidenceMethod,
  verdict: EvidenceVerdict,
  proof: z.string().max(PROOF_MAX),
  fidelity: EvidenceFidelity.default("static"),
  via: z.string().max(VIA_MAX).optional(),
  blocker: EvidenceBlocker.optional(),
  files: z.array(Attachment).max(ATTACHMENTS_MAX).default([]),
});
export type Evidence = z.infer<typeof Evidence>;

export const MandateArtifacts = z.object({
  branch: z.string().min(1).optional(),
  commit: CommitSha.optional(),
  merged: z.array(CommitSha).max(MANDATE_CRITERIA_MAX).default([]),
  prUrl: z.url().optional(),
});
export type MandateArtifacts = z.infer<typeof MandateArtifacts>;

const TAIL_MAX = 2000;

const CheckOutcome = z.object({
  name: z.string().min(1).max(40),
  command: z.string().min(1).max(500),
  ok: z.boolean(),
  exitCode: z.int().nullable(),
  ms: z.int().nonnegative(),
  tail: z.string().max(TAIL_MAX),
});

export const Baseline = z.object({
  at: IsoDateTime,
  commit: CommitSha,
  setup: z.object({ ok: z.boolean(), ms: z.int().nonnegative(), tail: z.string().max(TAIL_MAX) }),
  checks: z.array(CheckOutcome).max(20),
});
export type Baseline = z.infer<typeof Baseline>;

export const MandateSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat"), messageId: ChatMessageId }),
  z.object({ kind: z.literal("mail"), connector: MailConnector, externalId: z.string().min(1) }),
  z.object({ kind: z.literal("manual") }),
]);
export type MandateSource = z.infer<typeof MandateSource>;

export const Mandate = z.object({
  id: MandateId,
  projectId: ProjectId,
  title: z.string().min(1).max(200),
  request: z.string().max(BRIEF_MAX),
  source: MandateSource,
  rootTaskId: TaskId,
  acceptance: z.array(MandateCriterion).max(MANDATE_CRITERIA_MAX).default([]),
  evidence: z.array(Evidence).default([]),
  status: MandateStatus,
  round: z.int().nonnegative().default(0),
  artifacts: MandateArtifacts.prefault({}),
  baseline: Baseline.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  closedAt: IsoDateTime.optional(),
});
export type Mandate = z.infer<typeof Mandate>;
