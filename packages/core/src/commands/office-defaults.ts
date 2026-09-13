import { type Agent, Budgets, type ProjectId } from "@ho/protocol";
import { defaultChoice } from "../providers.ts";
import type { CommandContext } from "../result.ts";

/**
 * The boss every floor gets when it is created (D23): Andrew runs the floor from his office, plans the human's
 * requests and delegates them to the floor's staff — or does the work himself while the floor has nobody else.
 * Model and effort follow the catalog's boss defaults (D12, B33.4). Everything is editable afterwards in Settings.
 */
const DEFAULT_BOSS = {
  name: "Andrew",
  role: "boss",
  provider: "claude-code",
  ...defaultChoice("claude-code", "boss"),
  appearance: { gender: "male" },
  skillPack: "boss",
  basePrompt:
    "You run this floor. Understand each request, split it into tasks with clear acceptance criteria, hand them to the right colleague and keep your replies to the human short and concrete. When you have no colleagues, do the work yourself.",
} satisfies Omit<Agent, "id" | "budgets" | "projectId" | "createdAt" | "updatedAt">;

/** A fresh Andrew for a new floor. */
export const bossFor = (projectId: ProjectId, ctx: CommandContext): Agent => ({
  id: ctx.ids.agent(),
  ...DEFAULT_BOSS,
  budgets: Budgets.parse({}),
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
