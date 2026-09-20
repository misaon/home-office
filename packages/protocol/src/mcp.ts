import { z } from "zod";
import { ATTACHMENTS_MAX, AttachmentName, CHAT_OUTBOX_DIR } from "./attachments.ts";
import {
  DEPENDENCIES_MAX,
  EffortLevel,
  PublishMode,
  REPORT_MAX,
  TaskPriority,
  TaskSpec,
} from "./domain.ts";
import { TaskId } from "./ids.ts";
import { CRITERION_MAX, EvidenceVerdict, MANDATE_CRITERIA_MAX, PROOF_MAX } from "./mandate.ts";
import { StaffRole } from "./roles.ts";

const CRITERIA_MAX = 12;

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
});
export type CriterionJudgement = z.infer<typeof CriterionJudgement>;

export const HoReportInput = z.object({
  status: z
    .enum(["review", "done", "blocked"])
    .describe(
      "review: the work is committed and ready for review, the only successful ending of a work session; done: the triage or the plan is finished; blocked: you cannot continue, and the summary says why",
    ),
  summary: z
    .string()
    .min(1)
    .max(REPORT_MAX)
    .describe(
      `Published verbatim as the pull-request description and, for tasks that came from an issue, as the comment on that issue. Markdown. Say what changed, how you verified it and what stays open; name no credentials and no paths outside the repository. At most ${String(REPORT_MAX)} characters.`,
    ),
  files: z
    .array(AttachmentName)
    .max(ATTACHMENTS_MAX)
    .prefault([])
    .describe(
      `Work sessions only: screenshots or other files for the human, written into ${CHAT_OUTBOX_DIR}; names only, no paths. Attach a screenshot of every change a user can see, so the result shows up in the office chat.`,
    ),
  criteria: z
    .array(
      z.object({
        index: z.int().positive().describe("The criterion's number as the briefing lists it"),
        how: z
          .string()
          .min(1)
          .max(PROOF_MAX)
          .describe("The command you ran or the page you opened, and what you observed"),
      }),
    )
    .max(CRITERIA_MAX)
    .optional()
    .describe(
      "Work sessions: how you verified each acceptance criterion yourself. Recorded as your own evidence next to the reviewers'; a criterion you did not exercise is left out.",
    ),
  acceptance: z
    .array(z.string().min(1).max(CRITERION_MAX))
    .max(MANDATE_CRITERIA_MAX)
    .optional()
    .describe(
      'Triage and plan sessions: the conditions under which the human\'s whole request counts as done, each "When <condition>, the system shall <behaviour>" and observable on the combined result of every task. The office verifies them on the integrated branch once every task is done and reopens the work when one fails. Leave it out when the request is one task whose own criteria say it all.',
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
  criteria: z
    .array(CriterionJudgement)
    .max(CRITERIA_MAX)
    .describe(
      "One entry per acceptance criterion of the task, by its number. The office keeps them as evidence on the commit you reviewed; approve is refused while any criterion fails.",
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

export const HoRecallInput = z.object({
  query: z
    .string()
    .min(2)
    .max(200)
    .describe(
      "What you want to know about, in a few words: a file, a subsystem, an error, a decision.",
    ),
  limit: z
    .int()
    .positive()
    .max(10)
    .default(5)
    .describe("How many past tasks to return, most relevant first."),
});
export type HoRecallInput = z.infer<typeof HoRecallInput>;

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
  role: StaffRole.describe(
    "What they are for: backend, frontend, devops or developer build; qa tests; security audits; head reviews last; analyst specifies; secretary takes errands",
  ),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "A model id your own provider accepts; omit for the role's default. A wrong id fails at the colleague's first session, so use ids you know exist. Pick a cheaper one for mechanical work",
    ),
  effort: EffortLevel.optional().describe("Reasoning effort, when the provider takes one"),
  basePrompt: z.string().max(4000).default("").describe("How they work, not what they work on"),
});
export type HoHireInput = z.infer<typeof HoHireInput>;

export const HoDismissInput = z.object({
  agent: z
    .string()
    .min(1)
    .describe("Name or id of the colleague on this floor who is leaving; never your own"),
  reason: z
    .string()
    .min(1)
    .max(500)
    .describe("Why this floor no longer needs them; it is kept in the office record"),
});
export type HoDismissInput = z.infer<typeof HoDismissInput>;

export const HoDelegateInput = z.object({
  title: z.string().min(1).max(200),
  goal: TaskSpec.shape.goal.describe("One sentence: what this task achieves and for whom"),
  acceptanceCriteria: TaskSpec.shape.acceptanceCriteria.describe(
    'Independently checkable conditions, each one "When <condition>, the system shall <behaviour>". The reviewer checks exactly these, so a criterion nobody can verify is not a criterion.',
  ),
  constraints: TaskSpec.shape.constraints.describe(
    "What the worker must not change, must reuse, or must keep working",
  ),
  outOfScope: TaskSpec.shape.outOfScope.describe(
    "Nearby work this task deliberately does not include",
  ),
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
  browser: z
    .boolean()
    .optional()
    .describe(
      "true only when the result must be seen in a browser (UI changes, screenshots): the worker and the reviewer then get headless Chromium with Playwright tools. Omit for everything else.",
    ),
  qa: z
    .boolean()
    .describe(
      "true when QA should exercise behaviour before the final review: a flow, a form, an API or data change, anything with states to walk through. false for content, copy, styling, documentation, configuration and refactors: the head of development checks those in the browser without a separate QA pass.",
    ),
  security: z
    .boolean()
    .describe(
      "true when the change touches authentication, authorisation, input handling, secrets, cryptography, network exposure, dependencies or a hot path where performance matters; the security engineer then reviews it before the head of development.",
    ),
  dependsOn: z
    .array(TaskId)
    .max(DEPENDENCIES_MAX)
    .prefault([])
    .describe(
      "Task ids this task builds on, as earlier ho_delegate calls returned them. The task waits until every one of them is done, and its branch starts from the last of them, so the worker sees their result. The task that depends on all the others is where the whole request is checked as one.",
    ),
  priority: TaskPriority.optional(),
});
export type HoDelegateInput = z.infer<typeof HoDelegateInput>;

export const HoPlanInput = z.object({
  title: z.string().min(1).max(200),
  brief: z
    .string()
    .min(1)
    .max(12_000)
    .describe(
      "The request as the human made it, plus everything they clarified since; the analyst turns it into specified tasks",
    ),
  context: z
    .string()
    .max(4000)
    .prefault("")
    .describe(
      "What the repository cannot tell the analyst: decisions already made, links, constraints the human named",
    ),
  assignee: z
    .string()
    .min(1)
    .optional()
    .describe("Colleague name or id; omit for the floor's analyst"),
  priority: TaskPriority.optional(),
});
export type HoPlanInput = z.infer<typeof HoPlanInput>;

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
