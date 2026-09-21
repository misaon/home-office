import { z } from "zod";
import { IsoDateTime } from "./domain.ts";
import { SessionId } from "./ids.ts";

export const PlanWindow = z.object({
  percent: z.number().min(0),
  resetsAt: IsoDateTime.nullable(),
});
export type PlanWindow = z.infer<typeof PlanWindow>;

export const PlanUsage = z.object({
  at: IsoDateTime,
  fiveHour: PlanWindow.nullable(),
  sevenDay: PlanWindow.nullable(),
});
export type PlanUsage = z.infer<typeof PlanUsage>;

export const PlanUsageStatus = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("off"), reason: z.string() }),
  z.object({ kind: z.literal("sign_in"), message: z.string() }),
  z.object({ kind: z.literal("unavailable"), message: z.string() }),
  z.object({
    kind: z.literal("ok"),
    usage: PlanUsage,
    running: z.record(SessionId, z.number().nonnegative()),
  }),
]);
export type PlanUsageStatus = z.infer<typeof PlanUsageStatus>;
