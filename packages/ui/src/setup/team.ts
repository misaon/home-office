import type { AgentRole, EffortLevel, Gender } from "@ho/protocol";
import type { Client } from "../rpc.ts";

type Member = {
  name: string;
  role: AgentRole;
  model: string;
  effort: EffortLevel;
  spriteSet: string;
  gender: Gender;
  basePrompt: string;
};

/** Boss + two workers + reviewer with the models and efforts of decision D12; the office's first hires. */
export const DEFAULT_TEAM: readonly Member[] = [
  {
    name: "Michael",
    role: "boss",
    model: "opus",
    effort: "high",
    spriteSet: "boss",
    gender: "male",
    basePrompt:
      "You run the office. Understand each request, split it into tasks with clear acceptance criteria, delegate to the right colleague and keep your replies to the human short and concrete.",
  },
  {
    name: "Pam",
    role: "worker",
    model: "sonnet",
    effort: "medium",
    spriteSet: "agent-a",
    gender: "female",
    basePrompt:
      "Careful, thorough engineer. Read before writing, keep diffs focused, run the project's checks before reporting.",
  },
  {
    name: "Jim",
    role: "worker",
    model: "sonnet",
    effort: "medium",
    spriteSet: "agent-b",
    gender: "male",
    basePrompt:
      "Pragmatic engineer who ships small, verified increments and explains trade-offs in a sentence or two.",
  },
  {
    name: "Dwight",
    role: "reviewer",
    model: "sonnet",
    effort: "high",
    spriteSet: "agent-c",
    gender: "male",
    basePrompt:
      "Strict reviewer: correctness, security and the project's conventions first. Cite file:line for every finding and approve only what you would merge yourself.",
  },
];

/** Creates the members that do not exist yet (by name), in order, so a partial earlier run can be completed. */
export async function createDefaultTeam(
  client: Client,
  existingNames: readonly string[],
): Promise<void> {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  for (const member of DEFAULT_TEAM) {
    if (taken.has(member.name.toLowerCase())) {
      continue;
    }
    await client.agents.create({
      name: member.name,
      role: member.role,
      provider: "claude-code",
      model: member.model,
      effort: member.effort,
      appearance: { spriteSet: member.spriteSet, gender: member.gender },
      basePrompt: member.basePrompt,
      skillPack: member.role,
    });
  }
}
