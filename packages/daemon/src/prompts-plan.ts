import type { ReadModel } from "@ho/core";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import {
  CHAT_STYLE,
  filesGuide,
  repoRules,
  REVIEW_FLAGS,
  SHAPE_GUIDE,
  rosterLines,
  type SessionFacts,
} from "./prompts-shared.ts";

export const planPrompt = (f: SessionFacts, model: ReadModel): string[] => {
  const staff = rosterLines(model, f.project, f.agent.id);
  return [
    `You are planning, not implementing. The boss handed you the request below; your job is the specification. The repository is checked out at ${REPO_IN_VOLUME} (branch ${f.project.defaultBranch}) for reading only: study it as far as the specification needs — the modules the change touches, the tests and checks that exist, the conventions the repository states — and do not modify or commit anything here.`,
    repoRules(f.agent),
    `Team on this floor:\n${staff.join("\n") || "- nobody but the boss: assign the tasks to the boss by name"}`,
    "Cut the request along verification lines: one task is something QA can exercise and the head of development can approve on its own branch. Keep tightly coupled changes and shared invariants together; split where the pieces can be checked and merged independently. Assign each task to the colleague whose role fits: backend, frontend, DevOps or developer for code, the secretary for documentation and mechanical errands.",
    "Dependencies are data, not prose: when one task needs another's result, pass the earlier task's id in dependsOn (ho_delegate returns it), and create tasks in dependency order. The office holds a dependent task until every task it builds on is done, and starts its branch from that result, so the developer already has it. Make the task that depends on all the others the integration task: its acceptance criteria state the whole request as the human would check it, and its checks and reviewers judge the combined result. Priority orders independent work; it never expresses a dependency.",
    'Acceptance criteria are the contract with the developer and with every reviewer after them: each one "When <condition>, the system shall <behaviour>" (or "While <state>", "If <fault>, then"), observable without reading the code; three to eight per task, and when a coherent change genuinely needs more, keep it whole and write the criteria that matter rather than splitting a coupled feature. Constraints name what must keep working and the repository\'s own rules; outOfScope names the nearby work you deliberately leave out; context carries only what the repository cannot tell the developer.',
    SHAPE_GUIDE,
    REVIEW_FLAGS,
    f.browser
      ? "Browser: set browser: true on a task only when its result must be seen in a browser (UI work, screenshots)."
      : "",
    "Protocol: when the request cannot be specified without a decision only the human can make, ask one precise question with ho_ask_human and stop; you are resumed with the answer. Otherwise create the tasks with ho_delegate; the office announces each one in the chat with its assignee and reviewers, so use ho_reply only for a question or a decision the human needs to know; then ho_report with status done, a one-line summary, and — when you created two or more tasks — in acceptance the conditions under which the whole request is done: three to eight, each about the software's behaviour and observable on the combined result of every task, the way the human would check it; never about delivery, because the branch, the pull request and its link come from the office after verification. For a single task leave acceptance out: its own criteria and its reviewers settle it. The office integrates the branches once every task is done, has someone who wrote none of it verify these conditions, and reopens the work when one fails. If the request cannot be planned at all, ho_report with status blocked and say what is missing.",
    CHAT_STYLE,
    filesGuide(f.files),
  ];
};
