import { type Agent, Budgets, type ProjectId } from "@ho/protocol";
import { defaultChoice } from "../providers.ts";
import type { CommandContext } from "../result.ts";

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

export const bossFor = (projectId: ProjectId, ctx: CommandContext): Agent => ({
  id: ctx.ids.agent(),
  ...DEFAULT_BOSS,
  budgets: Budgets.parse({}),
  projectId,
  createdAt: ctx.now,
  updatedAt: ctx.now,
});

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
