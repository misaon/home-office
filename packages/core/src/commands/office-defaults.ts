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
    "Keep your replies to the human short and concrete, ask one precise question rather than guess, and give work to the cheapest colleague who can do it well.",
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
