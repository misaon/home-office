import { z } from "zod";
import { ATTACHMENTS_MAX, AttachmentName, CHAT_OUTBOX_DIR } from "./attachments.ts";
import { CRITERIA_MAX, PublishMode, TaskPriority } from "./domain.ts";
import { TaskId } from "./ids.ts";

export const HoReportInput = z.object({
  status: z
    .enum(["review", "done", "blocked"])
    .describe(
      "review: work is committed and ready for review; done: no review needed (only for triage or when told so); blocked: you cannot continue",
    ),
  summary: z
    .string()
    .min(1)
    .max(6000)
    .describe(
      "What changed, how you verified it, open questions. Plain text; keep it under a page.",
    ),
});
export type HoReportInput = z.infer<typeof HoReportInput>;

export const HoReviewInput = z.object({
  verdict: z.enum(["approve", "request_changes"]),
  findings: z
    .string()
    .min(1)
    .max(4000)
    .describe("Numbered findings with file:line references, or a short approval note."),
});
export type HoReviewInput = z.infer<typeof HoReviewInput>;

export const HoHandoffInput = z.object({
  toAgent: z.string().min(1).describe("Target agent name or id"),
  brief: z
    .string()
    .min(1)
    .max(4000)
    .describe("What the colleague should do next and what state the branch is in"),
});
export type HoHandoffInput = z.infer<typeof HoHandoffInput>;

export const HoAskHumanInput = z.object({
  question: z.string().min(1).max(2000),
});
export type HoAskHumanInput = z.infer<typeof HoAskHumanInput>;

export const HoHireInput = z.object({
  name: z.string().min(1).max(60).describe("A first name nobody on this floor uses yet"),
  role: z.enum(["worker", "reviewer"]).describe("What they are for"),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Provider model id; omit for the role's default. Pick a cheaper one for mechanical work",
    ),
  effort: z.string().min(1).optional().describe("Reasoning effort, when the provider takes one"),
  basePrompt: z.string().max(4000).default("").describe("How they work, not what they work on"),
  why: z.string().min(1).max(300).describe("One sentence: why nobody already here fits"),
});
export type HoHireInput = z.infer<typeof HoHireInput>;

export const HoDelegateInput = z.object({
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(2000).describe("One sentence: what this task achieves and for whom"),
  acceptanceCriteria: z
    .array(z.string().min(1).max(2000))
    .min(1)
    .max(CRITERIA_MAX)
    .describe(
      'Independently checkable conditions, each one "When <condition>, the system shall <behaviour>". The reviewer checks exactly these, so a criterion nobody can verify is not a criterion.',
    ),
  constraints: z
    .array(z.string().min(1).max(2000))
    .max(CRITERIA_MAX)
    .prefault([])
    .describe("What the worker must not change, must reuse, or must keep working"),
  outOfScope: z
    .array(z.string().min(1).max(2000))
    .max(CRITERIA_MAX)
    .prefault([])
    .describe("Nearby work this task deliberately does not include"),
  context: z
    .string()
    .max(4000)
    .prefault("")
    .describe(
      "Background the worker cannot derive from the repository: decisions, links, prior art",
    ),
  assignee: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Colleague name or id on this floor (your own name when you do it yourself); omit to leave the task in the inbox",
    ),
  publish: PublishMode.optional().describe(
    "Set only when the human asked for a particular delivery — pull-request when they want a PR, branch when they explicitly do not. Omit to follow the floor's own setting.",
  ),
  priority: TaskPriority.optional(),
});
export type HoDelegateInput = z.infer<typeof HoDelegateInput>;

export const HoTaskStatusInput = z.object({
  taskId: TaskId.optional().describe("Defaults to the current task"),
});
export type HoTaskStatusInput = z.infer<typeof HoTaskStatusInput>;

export const HoPublishInput = z.object({
  taskId: TaskId.describe("The finished task whose branch should be published"),
});
export type HoPublishInput = z.infer<typeof HoPublishInput>;

export const HoReplyInput = z.object({
  text: z.string().min(1).max(4000).describe("Message to the human in the office chat"),
  files: z
    .array(AttachmentName)
    .max(ATTACHMENTS_MAX)
    .prefault([])
    .describe(
      `File names you wrote into ${CHAT_OUTBOX_DIR} to send with this message (images, PDF, text); names only, no paths`,
    ),
});
export type HoReplyInput = z.infer<typeof HoReplyInput>;

export const HoGetSkillInput = z.object({
  name: z.string().min(1).max(64).describe("Skill name exactly as ho_list_skills reported it"),
});
export type HoGetSkillInput = z.infer<typeof HoGetSkillInput>;

export const HoGetSkillFileInput = HoGetSkillInput.extend({
  path: z
    .string()
    .min(1)
    .max(200)
    .describe("Bundled file path as ho_get_skill listed it, e.g. references/REFERENCE.md"),
});
export type HoGetSkillFileInput = z.infer<typeof HoGetSkillFileInput>;
