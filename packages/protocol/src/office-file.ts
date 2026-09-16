import { z } from "zod";
import {
  AgentRole,
  AuthKind,
  BASE_PROMPT_MAX,
  Budgets,
  EffortLevel,
  Gender,
  ProviderId,
} from "./domain.ts";
import { ProjectId } from "./ids.ts";
import { IntakePolicy, PublishPolicy, ServicesPolicy, VerifyPolicy } from "./policies.ts";

export const OFFICE_DIR = ".ho";
export const OFFICE_FILE = "config.json";
export const OFFICE_LOCAL_FILE = "config.local.json";

export const OFFICE_SCHEMA_URL =
  "https://raw.githubusercontent.com/misaon/home-office/main/schema/office.schema.json";

export const OfficeFileAgent = z.strictObject({
  name: z.string().min(1).max(60),
  role: AgentRole,
  gender: Gender.optional(),
  provider: ProviderId,
  auth: AuthKind.optional(),
  model: z.string().min(1).optional(),
  effort: EffortLevel.optional(),
  skillPack: z.string().min(1).optional(),
  basePrompt: z.string().max(BASE_PROMPT_MAX).optional(),
  budgets: Budgets.optional(),
});
export type OfficeFileAgent = z.infer<typeof OfficeFileAgent>;

export const OfficeFile = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1).max(80).optional(),
  defaultBranch: z.string().min(1).optional(),
  publish: PublishPolicy.optional(),
  intake: IntakePolicy.optional(),
  services: ServicesPolicy.optional(),
  verify: VerifyPolicy.optional(),
  budgets: Budgets.optional(),
  agents: z.array(OfficeFileAgent).max(100).optional(),
});
export type OfficeFile = z.infer<typeof OfficeFile>;

export const OfficeFileSync = z.object({
  projectId: ProjectId,
  source: z.string().nullable(),
  applied: z.boolean(),
  changes: z.array(z.string()),
  problems: z.array(z.string()),
});
export type OfficeFileSync = z.infer<typeof OfficeFileSync>;

export const OfficeFileExport = z.object({
  projectId: ProjectId,
  path: z.string(),
  bytes: z.int().nonnegative(),
});
export type OfficeFileExport = z.infer<typeof OfficeFileExport>;
