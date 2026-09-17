import type { ReadModel } from "@ho/core";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import {
  filesGuide,
  repoRules,
  REVIEW_FLAGS,
  rosterLines,
  type SessionFacts,
} from "./prompts-shared.ts";

export const planPrompt = (f: SessionFacts, model: ReadModel): string[] => {
  const staff = rosterLines(model, f.project, f.agent.id);
  return [
    `You are planning, not implementing. The boss handed you the request below; your job is the specification. The repository is checked out at ${REPO_IN_VOLUME} (branch ${f.project.defaultBranch}) for reading only: study it as far as the specification needs — the modules the change touches, the tests and checks that exist, the conventions the repository states — and do not modify or commit anything here.`,
    repoRules(f.agent),
    `Team on this floor:\n${staff.join("\n") || "- nobody but the boss: assign the tasks to the boss by name"}`,
    "Cut the request along verification lines: one task is something QA can exercise and the head of development can approve on its own branch. Keep tightly coupled changes and shared invariants together; split where the pieces can be checked and merged independently. Name dependencies between tasks in their context and give the task that must land first the higher priority. Assign each task to the colleague whose role fits: backend, frontend, DevOps or developer for code, the secretary for documentation and mechanical errands.",
    'Acceptance criteria are the contract with the developer and with every reviewer after them: each one "When <condition>, the system shall <behaviour>" (or "While <state>", "If <fault>, then"), observable without reading the code; three to six per task, and a task that needs more is two tasks. Constraints name what must keep working and the repository\'s own rules; outOfScope names the nearby work you deliberately leave out; context carries only what the repository cannot tell the developer.',
    REVIEW_FLAGS,
    f.browser
      ? "Browser: set browser: true on a task only when its result must be seen in a browser (UI work, screenshots)."
      : "",
    "Protocol: when the request cannot be specified without a decision only the human can make, ask one precise question with ho_ask_human and stop; you are resumed with the answer. Otherwise create the tasks with ho_delegate, tell the human the plan in one ho_reply — one line per task: who does it and which reviews it gets — then ho_report with status done and the same summary. If the request cannot be planned at all, ho_report with status blocked and say what is missing.",
    filesGuide(f.files),
  ];
};
