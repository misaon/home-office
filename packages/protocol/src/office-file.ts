// The floor's own configuration, kept in the repository it describes: `.ho/config.json`, with an
// optional `.ho/config.local.json` beside it for one machine. Secrets are never in either — an agent
// record carries `provider` and `auth`, and `secretKeysFor` derives the credential-store key from them.
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
import { IntakePolicy, PublishPolicy, ServicesPolicy } from "./policies.ts";

/** The directory in the repository root, and the two files the office reads out of it. */
export const OFFICE_DIR = ".ho";
export const OFFICE_FILE = "config.json";
export const OFFICE_LOCAL_FILE = "config.local.json";

/** Where the generated JSON Schema is published; `$schema` in an exported file points at it. */
export const OFFICE_SCHEMA_URL =
  "https://raw.githubusercontent.com/misaon/home-office/main/schema/office.schema.json";

/**
 * One colleague as the file describes them. Everything but the name, the role and the provider is
 * optional: on a floor that already has this person an absent field leaves theirs alone, and on a new
 * hire it falls back to the provider catalogue's default for the role.
 */
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
  /** Overrides the file's floor-wide `budgets` for this one colleague. */
  budgets: Budgets.optional(),
});
export type OfficeFileAgent = z.infer<typeof OfficeFileAgent>;

/**
 * What a repository says its floor should be. Every field is optional and an absent one changes
 * nothing, which is what makes a small file legal. `agents` is the exception worth knowing: absent
 * leaves the staff alone, an empty array asks for a floor with nobody on it but the boss.
 */
export const OfficeFile = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1).max(80).optional(),
  defaultBranch: z.string().min(1).optional(),
  publish: PublishPolicy.optional(),
  intake: IntakePolicy.optional(),
  services: ServicesPolicy.optional(),
  /** The floor's default for colleagues that carry no `budgets` of their own. */
  budgets: Budgets.optional(),
  agents: z.array(OfficeFileAgent).max(100).optional(),
});
export type OfficeFile = z.infer<typeof OfficeFile>;

/**
 * What one apply did, or would do. `changes` reads as a diff and is the same whether or not the events
 * were appended; `problems` names what the file asked for and the floor could not give it.
 */
export const OfficeFileSync = z.object({
  projectId: ProjectId,
  /** The file this came from, or null when the repository has none (not a failure). */
  source: z.string().nullable(),
  /** False for a dry run, and for a run that found nothing to change. */
  applied: z.boolean(),
  changes: z.array(z.string()),
  problems: z.array(z.string()),
});
export type OfficeFileSync = z.infer<typeof OfficeFileSync>;

/** Where `ho project export` wrote the floor, and how long the file is. */
export const OfficeFileExport = z.object({
  projectId: ProjectId,
  path: z.string(),
  bytes: z.int().nonnegative(),
});
export type OfficeFileExport = z.infer<typeof OfficeFileExport>;
