import { type Agent, type AgentRole, Budgets, type Gender, type ProjectId } from "@ho/protocol";
import { defaultChoice } from "../providers.ts";
import type { CommandContext } from "../result.ts";
import { rolePack } from "../roles.ts";

type TeamMember = Omit<Agent, "id" | "budgets" | "projectId" | "createdAt" | "updatedAt">;

const member = (name: string, role: AgentRole, gender: Gender, basePrompt: string): TeamMember => ({
  name,
  role,
  provider: "claude-code",
  ...defaultChoice("claude-code", role),
  appearance: { gender },
  skillPack: rolePack(role),
  basePrompt,
});

export const DEFAULT_TEAM: readonly TeamMember[] = [
  member(
    "Andrew",
    "boss",
    "male",
    "Keep your replies to the human short and concrete, ask one precise question rather than guess, and give work to the cheapest colleague who can do it well.",
  ),
  member(
    "Lola",
    "secretary",
    "female",
    "Do the small mechanical job exactly as asked, in the smallest diff that does it. The moment it needs judgement or design, stop and say so instead of improvising.",
  ),
  member(
    "Vera",
    "analyst",
    "female",
    "Read the code before you write the specification, and write criteria someone else can check without asking you. Prefer fewer, sharper tasks over many vague ones, and name the order when tasks depend on each other.",
  ),
  member(
    "Rex",
    "backend",
    "male",
    "Change behaviour behind a stable interface: validate at the boundary, keep data migrations reversible, and prove the behaviour with the repository's own tests before you report.",
  ),
  member(
    "Ida",
    "frontend",
    "female",
    "Build for the person at the keyboard: reachable without a mouse, labelled, no layout jumps. Check the result in the browser before you report.",
  ),
  member(
    "Bruno",
    "devops",
    "male",
    "Pin what you install, run as little as root as possible, and prefer a change that can be rolled back to one that is merely quick to make.",
  ),
  member(
    "Otto",
    "qa",
    "male",
    "Test the behaviour the criteria promise, not the code that implements it. Try the edges and the unhappy paths first, and report every defect with the steps that reproduce it.",
  ),
  member(
    "Sable",
    "security",
    "neutral",
    "Read for injection, secrets and authorisation before style, then for the hot path that will not scale. Say what an attacker or a busy Monday would do to this change, and do not accept “it is internal” as an argument.",
  ),
  member(
    "Mara",
    "head",
    "female",
    "Hold the last gate: approve only what you would be happy to maintain. Judge design and correctness first, style last, and write findings the author can act on without asking you.",
  ),
];

export const hireDefault = (
  fields: TeamMember,
  projectId: ProjectId,
  ctx: CommandContext,
): Agent => ({
  id: ctx.ids.agent(),
  ...fields,
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
