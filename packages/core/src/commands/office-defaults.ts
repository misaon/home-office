import type { Agent, ProjectId } from "@ho/protocol";
import type { CommandContext } from "./context.ts";

/**
 * The boss every floor gets when it is created (D23): Andrew runs the floor from his office, plans the human's
 * requests and delegates them to the floor's staff — or does the work himself while the floor has nobody else.
 * Model follows D12 (`opus`); effort is `medium` because the boss triages and delegates rather than
 * changing the repository (B33.4). Everything is editable afterwards in Settings.
 */
export const DEFAULT_BOSS = {
  name: "Andrew",
  role: "boss",
  provider: "claude-code",
  auth: "subscription",
  model: "opus",
  effort: "medium",
  appearance: { spriteSet: "boss", gender: "male" },
  skillPack: "boss",
  basePrompt:
    "You run this floor. Understand each request, split it into tasks with clear acceptance criteria, hand them to the right colleague and keep your replies to the human short and concrete. When you have no colleagues, do the work yourself.",
} as const satisfies Omit<Agent, "id" | "budgets" | "projectId" | "createdAt" | "updatedAt">;

/** The receptionist is an office character of every floor, not an agent: no model, no sessions, no settings. */
export const RECEPTIONIST = { name: "Lola", spriteSet: "receptionist" } as const;

const DEFAULT_BUDGETS: Agent["budgets"] = {
  maxTurnsPerTask: 60,
  maxConcurrentSessions: 1,
  maxWallMinutes: 60,
  maxReviewRounds: 2,
};

/** A fresh Andrew for a new floor. */
export const bossFor = (projectId: ProjectId, ctx: CommandContext): Agent => ({
  id: ctx.ids.agent(),
  ...DEFAULT_BOSS,
  budgets: DEFAULT_BUDGETS,
  projectId,
  createdAt: ctx.now,
  updatedAt: ctx.now,
});

/** The same character on another floor: persona, appearance, model and budgets travel; the id is new. */
export const copyOf = (
  source: Agent,
  projectId: ProjectId,
  name: string,
  ctx: CommandContext,
): Agent => ({
  ...source,
  id: ctx.ids.agent(),
  name,
  projectId,
  createdAt: ctx.now,
  updatedAt: ctx.now,
});
