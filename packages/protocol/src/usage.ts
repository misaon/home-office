// What a floor spends and what it is allowed to spend. Neither depends on anything else in the domain,
// which is why they live here: domain.ts stays about the entities.
import { z } from "zod";

export const Budgets = z.object({
  maxTurnsPerTask: z.int().positive().default(60),
  maxConcurrentSessions: z.int().positive().default(1),
  maxWallMinutes: z.int().positive().default(60),
  maxReviewRounds: z.int().nonnegative().default(2),
  /** API-key sessions only (Claude Code `--max-budget-usd`); subscriptions have no per-task price. */
  maxUsdPerTask: z.number().positive().optional(),
});
export type Budgets = z.infer<typeof Budgets>;

export const Usage = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  turns: z.int().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
};

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  turns: a.turns + b.turns,
});
