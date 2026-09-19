import { findAgentByRef, isLastReviewerOfStage, removeAgent } from "@ho/core";
import { HoDismissInput, ROLE_TITLE } from "@ho/protocol";
import { define } from "./mcp-tool.ts";

export const dismiss = define({
  name: "ho_dismiss",
  description:
    "Let a colleague go when this floor no longer needs their role, so it stops routing work to them. They must be idle first: finish, cancel or reassign whatever they still hold. You cannot dismiss yourself, and you cannot dismiss the only person covering a review stage — hire the replacement first, then let the other one go. What they already finished stays in the office record.",
  schema: HoDismissInput,
  modes: ["triage"],
  run: async (input, office, entry, actor) => {
    const project = office.model.projects.get(entry.ctx.projectId);
    if (project?.hiring.enabled !== true) {
      throw new Error("this floor's roster is the human's; they let colleagues go in the Team tab");
    }
    const boss = office.model.agents.get(entry.ctx.agentId);
    if (boss?.role !== "boss") {
      throw new Error("only the boss of a floor lets a colleague go");
    }
    const leaving = findAgentByRef(office.model, input.agent, entry.ctx.projectId);
    if (leaving === undefined) {
      throw new Error(`nobody called "${input.agent}" works on this floor`);
    }
    if (leaving.id === boss.id) {
      throw new Error("a floor keeps its boss; you cannot dismiss yourself");
    }
    if (isLastReviewerOfStage(office.model, leaving)) {
      throw new Error(
        `${leaving.name} is the only ${ROLE_TITLE[leaving.role]} here, and that review stage would silently stop happening; hire a replacement first`,
      );
    }
    await office.execute(actor, (m, c) => removeAgent(m, leaving.id, c, input.reason));
    return { name: leaving.name, role: leaving.role, reason: input.reason };
  },
});
