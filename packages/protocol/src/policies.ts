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

export const RepositoryTrust = z.enum(["untrusted", "trusted"]);
export type RepositoryTrust = z.infer<typeof RepositoryTrust>;

export const ServicesPolicy = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["rootless", "rootful"]).default("rootless"),
  trust: RepositoryTrust.default("untrusted"),
});
export type ServicesPolicy = z.infer<typeof ServicesPolicy>;

export const servicesAvailable = (services: ServicesPolicy): boolean =>
  services.enabled && services.trust === "trusted";

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

const AcceptanceVerification = z.enum(["integration", "always", "never"]);

export const AcceptancePolicy = z.object({
  verify: AcceptanceVerification.default("integration"),
  maxFixRounds: z.int().min(0).max(5).default(2),
  maxVerifyTurns: z.int().min(10).max(500).default(60),
});
export type AcceptancePolicy = z.infer<typeof AcceptancePolicy>;

const ShellCommand = z.string().min(1).max(500);
const COMMANDS_MAX = 10;
const CheckName = z.string().regex(/^[a-z][a-z0-9-]{0,30}$/u);

const ReadyProbe = z.object({
  url: z.url().optional(),
  command: ShellCommand.optional(),
  timeoutSeconds: z.int().min(5).max(600).default(60),
});

export const EnvironmentPolicy = z.object({
  setup: z.array(ShellCommand).max(COMMANDS_MAX).default([]),
  services: z.array(ShellCommand).max(COMMANDS_MAX).default([]),
  seed: z.array(ShellCommand).max(COMMANDS_MAX).default([]),
  run: ShellCommand.optional(),
  ready: ReadyProbe.optional(),
  checks: z.record(CheckName, ShellCommand).default({}),
  timeoutSeconds: z.int().min(30).max(3600).default(600),
});
export type EnvironmentPolicy = z.infer<typeof EnvironmentPolicy>;

export const environmentDescribed = (environment: EnvironmentPolicy): boolean =>
  environment.setup.length > 0 ||
  environment.services.length > 0 ||
  environment.seed.length > 0 ||
  environment.run !== undefined ||
  Object.keys(environment.checks).length > 0;

const QUESTION_REASON_PREFIX = "question:";
export const questionReason = (question: string): string =>
  `${QUESTION_REASON_PREFIX} ${question.slice(0, 1900)}`;
export const isQuestionReason = (reason: string | undefined): boolean =>
  reason?.startsWith(QUESTION_REASON_PREFIX) === true;
