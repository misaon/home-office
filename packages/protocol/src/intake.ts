import { z } from "zod";
import { IsoDateTime } from "./domain.ts";
import { ProjectId } from "./ids.ts";

export const IntakeStatus = z.object({
  projectId: ProjectId,
  enabled: z.boolean(),
  lastPollAt: IsoDateTime.nullable(),
  nextPollAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  /** Items turned into tasks since the daemon started. */
  received: z.int().nonnegative(),
  /** Titles the last dry run would have received. */
  lastDryRun: z.array(z.string()),
});
export type IntakeStatus = z.infer<typeof IntakeStatus>;
export const IntakePollResult = z.object({
  projectId: ProjectId,
  received: z.int().nonnegative(),
  duplicates: z.int().nonnegative(),
  dryRun: z.array(z.string()),
});
export type IntakePollResult = z.infer<typeof IntakePollResult>;
