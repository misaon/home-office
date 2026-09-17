import { z } from "zod";

export const PublishMode = z.enum(["branch", "pull-request"]);
export type PublishMode = z.infer<typeof PublishMode>;

export const PublishPolicy = z.object({
  mode: PublishMode.default("branch"),
  draft: z.boolean().default(true),
});
export type PublishPolicy = z.infer<typeof PublishPolicy>;

export const MailConnector = z.string().min(1).max(40);
export type MailConnector = z.infer<typeof MailConnector>;
export const GITHUB_ISSUES_CONNECTOR = "github-issues";

export const IntakePolicy = z.object({
  enabled: z.boolean().default(false),
  intervalSeconds: z.int().min(30).max(3600).default(120),
  labels: z.array(z.string().min(1).max(50)).default([]),
  dryRun: z.boolean().default(false),
  ackLabel: z.string().max(50).default("home-office"),
  comment: z.boolean().default(true),
});
export type IntakePolicy = z.infer<typeof IntakePolicy>;

export const ServicesPolicy = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["rootless", "rootful"]).default("rootless"),
});
export type ServicesPolicy = z.infer<typeof ServicesPolicy>;

export const HiringPolicy = z.object({
  enabled: z.boolean().default(true),
});
export type HiringPolicy = z.infer<typeof HiringPolicy>;

export const PreviewPolicy = z.object({
  enabled: z.boolean().default(false),
  port: z.int().min(1024).max(65_535).default(8788),
});
export type PreviewPolicy = z.infer<typeof PreviewPolicy>;

export const VerifyPolicy = z.object({
  command: z.string().max(500).default(""),
  timeoutSeconds: z.int().min(10).max(3600).default(900),
  maxAttempts: z.int().min(1).max(5).default(2),
});
export type VerifyPolicy = z.infer<typeof VerifyPolicy>;

export const VERIFY_NOTE_PREFIX = "verification failed:";

const QUESTION_REASON_PREFIX = "question:";
export const questionReason = (question: string): string =>
  `${QUESTION_REASON_PREFIX} ${question.slice(0, 1900)}`;
export const isQuestionReason = (reason: string | undefined): boolean =>
  reason?.startsWith(QUESTION_REASON_PREFIX) === true;
