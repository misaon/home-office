import { type ReadModel, reviewPlanOf, verifyAttempts } from "@ho/core";
import { type Agent, type Project, ROLE_TITLE, type Task } from "@ho/protocol";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import {
  browserGuide,
  criteriaGuide,
  dependenciesGuide,
  filesGuide,
  repoRules,
  SANDBOX,
  serveGuide,
  servicesGuide,
  type SessionFacts,
} from "./prompts-shared.ts";

const COMMIT_RULE =
  "The office verifies and publishes exactly the commit at HEAD, and only from a clean tree: anything uncommitted or untracked when you report comes back to you as a failed check, so commit what belongs to the task and remove the rest before ho_report.";

const verifyGuide = (project: Project, task: Task): string => {
  if (project.verify.command === "") {
    return `This floor has no check command: the office publishes your HEAD commit without running anything, records that fact on the task, and tells the reviewers so. Before you report, run the checks the package you changed already defines — its build and test scripts, the linters its configuration names — and nothing more: do not survey the repository's tooling, and do not try to run an application whose services this sandbox does not have. ${COMMIT_RULE}`;
  }
  const left = Math.max(0, project.verify.maxAttempts - verifyAttempts(task));
  return `Done means \`${project.verify.command}\` passes. Run it yourself before you report. The office runs it again on your HEAD commit in a container with no network and an empty home directory, so everything the command needs must live under ${REPO_IN_VOLUME}; a failure comes back to you with the output, ${String(left)} more time(s) before the task is blocked. ${COMMIT_RULE}`;
};

const budgetGuide = (agent: Agent): string =>
  `Budget: ${String(agent.budgets.maxTurnsPerTask)} tool turns for this task across all its sessions and ${String(agent.budgets.maxWallMinutes)} minutes for this session. Commit at every working checkpoint: uncommitted changes are lost when the budget runs out, committed ones are kept for the next session.`;

const publishGuide = (task: Task, project: Project): string =>
  (task.publish ?? project.publish.mode) === "pull-request"
    ? "Publishing: the office pushes the verified commit and opens the pull request once the checks pass; your report becomes its description."
    : "Publishing: the office pushes the verified commit to the task branch; this floor does not open pull requests, so do not promise one.";

const reviewersGuide = (model: ReadModel, task: Task): string => {
  const plan = reviewPlanOf(model, task);
  if (plan.missing.length > 0) {
    const roles = plan.missing.map((stage) => ROLE_TITLE[stage]).join(" and ");
    return `Review: this task asks for a review by ${roles}, but nobody on this floor holds that role; when you report, the task waits for the human to hire one or waive it. Write your report as if for the head of development.`;
  }
  if (plan.chain.length === 0) {
    return "Review: this task asks for no review; the office closes it once the checks pass, so your report is the only account of the work.";
  }
  const names = plan.chain
    .map((agent) => `${agent.name} (${ROLE_TITLE[agent.role]})`)
    .join(", then ");
  return `Review: after the checks pass, ${names} read your verified commit in that order, each in their own copy of the repository and against the acceptance criteria, and any of them can send it back. Write your report for them: what changed and why, how to run it, and how you verified each criterion.`;
};

const PROTOCOL = [
  "Protocol: when the work is committed, call ho_report with status review, and in criteria how you verified each acceptance criterion yourself (the command you ran or the page you opened, and what you saw); then stop, leaving nothing uncommitted. If you are stuck on a decision only the human can make, commit what you have, call ho_ask_human and stop; you are resumed with the answer. If a colleague on this floor is better suited, commit and call ho_handoff with a clear brief.",
  "When things go wrong: a tool error names what was wrong with the call, so fix the input and retry once, then report blocked with the message. If the branch already contains the work, verify it and report review saying so. If the brief is wrong rather than unclear, ask the human instead of guessing. If you find a credential in the repository, leave it in place, never print it, and name the file in your report.",
];

export const workPrompt = (f: SessionFacts, model: ReadModel): string[] => [
  `The repository is checked out at ${REPO_IN_VOLUME} on branch ${f.branch}. Work only inside it and commit with clear Conventional Commit messages.`,
  SANDBOX,
  repoRules(f.agent),
  browserGuide(f.browser, true),
  serveGuide(f.preview, f.browser),
  servicesGuide(f.services),
  dependenciesGuide(f.base),
  `Task: ${f.task.title}`,
  criteriaGuide(f.task, "You are done when every one of these holds:"),
  verifyGuide(f.project, f.task),
  budgetGuide(f.agent),
  publishGuide(f.task, f.project),
  reviewersGuide(model, f.task),
  filesGuide(f.files),
  ...PROTOCOL,
];
