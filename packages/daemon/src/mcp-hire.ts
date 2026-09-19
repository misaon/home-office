import { createAgent, defaultChoice, rolePack } from "@ho/core";
import { HoHireInput } from "@ho/protocol";
import { define } from "./mcp-tool.ts";

export const hire = define({
  name: "ho_hire",
  description:
    "Take on a new colleague for this floor when nobody already here fits the work. They stay after this task and take later work too, so hire for a lasting need rather than one errand, and check ho_list_agents first. They use your provider and inherit your budgets.",
  schema: HoHireInput,
  modes: ["triage"],
  run: async (input, office, entry, actor) => {
    const project = office.model.projects.get(entry.ctx.projectId);
    if (project?.hiring.enabled !== true) {
      throw new Error("hiring is off for this floor; the human adds colleagues in the Team tab");
    }
    const boss = office.model.agents.get(entry.ctx.agentId);
    if (boss === undefined) {
      throw new Error("only the boss of a floor hires");
    }
    const choice = defaultChoice(boss.provider, input.role);
    const agent = await office.execute(actor, (m, c) =>
      createAgent(
        m,
        {
          name: input.name,
          role: input.role,
          appearance: { gender: "neutral" },
          provider: boss.provider,
          auth: choice.auth,
          model: input.model ?? choice.model,
          effort: input.effort ?? choice.effort,
          basePrompt: input.basePrompt,
          skillPack: rolePack(input.role),
          projectId: entry.ctx.projectId,
          budgets: { ...boss.budgets },
        },
        c,
      ),
    );
    return {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      model: agent.model,
      effort: agent.effort,
    };
  },
});
