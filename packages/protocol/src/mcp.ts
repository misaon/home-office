import { z } from "zod";
import { ATTACHMENTS_MAX, AttachmentName, CHAT_OUTBOX_DIR } from "./attachments.ts";
import { CRITERIA_MAX, TaskPriority } from "./domain.ts";
import { TaskId } from "./ids.ts";

/**
 * Tools the daemon exposes to agents over MCP. Inputs are deliberately small: the boss receives summaries,
 * never transcripts. Every call becomes domain events; nothing here touches a shell.
 */
export const HoReportInput = z.object({
  status: z
    .enum(["review", "done", "blocked"])
    .describe(
      "review: work is committed and ready for review; done: no review needed (only for triage or when told so); blocked: you cannot continue",
    ),
  summary: z
    .string()
    .min(1)
    .max(1500)
    .describe(
      "What changed, how you verified it, open questions. Plain text, under 1500 characters.",
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

/** The boss creates work on his own floor; `assignee` may be himself when nobody else is around. */
export const HoDelegateInput = z.object({
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(500).describe("One sentence: what this task achieves and for whom"),
  acceptanceCriteria: z
    .array(z.string().min(1).max(500))
    .min(1)
    .max(CRITERIA_MAX)
    .describe(
      'Independently checkable conditions, each one "When <condition>, the system shall <behaviour>". The reviewer checks exactly these, so a criterion nobody can verify is not a criterion.',
    ),
  constraints: z
    .array(z.string().min(1).max(500))
    .max(CRITERIA_MAX)
    .prefault([])
    .describe("What the worker must not change, must reuse, or must keep working"),
  outOfScope: z
    .array(z.string().min(1).max(500))
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
  priority: TaskPriority.optional(),
});
export type HoDelegateInput = z.infer<typeof HoDelegateInput>;

export const HoTaskStatusInput = z.object({
  taskId: TaskId.optional().describe("Defaults to the current task"),
});
export type HoTaskStatusInput = z.infer<typeof HoTaskStatusInput>;

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
