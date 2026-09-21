import { type ReadModel, reviewChain } from "@ho/core";
import { type Agent, type AgentRole, ROLE_TITLE, type Task } from "@ho/protocol";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { environmentGuide } from "./prompts-environment.ts";
import {
  authorClaims,
  browserGuide,
  changeSizeGuide,
  criteriaGuide,
  lspGuide,
  repoRules,
  SANDBOX,
  serveGuide,
  servicesGuide,
  type SessionFacts,
} from "./prompts-shared.ts";

const FOCUS: Partial<Record<AgentRole, string>> = {
  qa: "You review as QA. Run the floor's checks and the application, exercise every acceptance criterion the way a user would, then the edges and the unhappy paths the criteria imply, and read the tests the change adds: do they fail when the behaviour breaks? A criterion you could not exercise is a finding, not a pass. Write each defect as steps to reproduce, expected and actual.",
  security:
    "You review as the security engineer. Trace every input the change introduces from its entry point to the place it is trusted, and look for the OWASP Top 10 classes: broken access control, misconfiguration, supply chain and dependency changes, cryptography, injection, insecure design, authentication, data integrity, missing logging and mishandled exceptional conditions; then the hot path: unbounded work, N+1 queries, blocking calls, missing indexes, memory that grows with input. Order findings by severity and approve only when nothing above low severity remains.",
  head: "You review as the head of development, the last gate before the default branch. Judge design and correctness first: does the change belong here, does it do what the criteria say, is it as simple as it can be? Then tests, naming, consistency with the repository and documentation; style last, and only where the checks do not already settle it. Approve only what you would be happy to maintain.",
};

const focus = (agent: Agent): string =>
  FOCUS[agent.role] ??
  "You review as a colleague: correctness against the criteria, safety, and the repository's conventions.";

const chainGuide = (model: ReadModel, task: Task, agent: Agent): string => {
  const chain = reviewChain(model, task);
  if (chain.length <= 1) {
    return "";
  }
  const position = chain.findIndex((reviewer) => reviewer.id === agent.id);
  const names = chain.map((reviewer) => `${reviewer.name} (${ROLE_TITLE[reviewer.role]})`);
  const earlier =
    position <= 0
      ? ""
      : " The stages before you already ran the checks and exercised the result, in a browser when the task had one, and their verdicts are in your opening message: read them first and do not repeat their pass unless a finding makes you doubt it; your stage judges design, correctness and what it will cost to maintain.";
  return `Review chain for this task: ${names.join(" → ")}; you are stage ${String(position + 1)} of ${String(chain.length)}. Approving passes the commit to the next stage; request_changes sends it back to the author and the chain starts again from the first stage.${earlier}`;
};

const roundsGuide = (f: SessionFacts, model: ReadModel): string => {
  const worker = f.task.assigneeId === undefined ? undefined : model.agents.get(f.task.assigneeId);
  const left = (worker?.budgets.maxReviewRounds ?? 0) - f.task.reviewRounds;
  return left <= 0
    ? "This is the last round: request_changes now blocks the task for the human, so use it only for defects that must not merge."
    : `request_changes sends the work back to the author; it can do so ${String(left)} more time(s) before the task is blocked.`;
};

const checksGuide = (f: SessionFacts): string =>
  f.project.verify.command === ""
    ? "This floor runs no automatic checks: nothing was verified before you. Run the repository's own tests and checks yourself and treat their result as part of your verdict."
    : `The office already ran \`${f.project.verify.command}\` on this exact commit and it passed; review what the checks cannot see.`;

export const reviewPrompt = (f: SessionFacts, model: ReadModel): string[] => [
  `You are reviewing commit ${f.commit ?? "at the tip of the branch"} on branch ${f.branch}, checked out in your own copy of the repository at ${REPO_IN_VOLUME} (base branch: ${f.project.defaultBranch}). The office recorded that commit when the author reported; only it is published and reviewed, and nothing you change in this copy reaches it.`,
  SANDBOX,
  repoRules(f.agent),
  lspGuide(f.languages),
  browserGuide(f.browser, false),
  serveGuide(f.preview, f.browser),
  servicesGuide(f.services),
  environmentGuide(f, model),
  `Start with \`git -C ${REPO_IN_VOLUME} diff ${f.project.defaultBranch}...HEAD --stat\`, then the diff file by file; read surrounding code only where needed. If ${f.project.defaultBranch} is missing locally, review the branch's own commits with \`git log -p\`.`,
  changeSizeGuide(f.diff, f.project.defaultBranch),
  checksGuide(f),
  focus(f.agent),
  chainGuide(model, f.task, f.agent),
  criteriaGuide(
    f.task,
    "Judge each acceptance criterion; approve only when every one holds:",
    authorClaims(model, f.task),
  ),
  "Flag only what affects correctness, safety or the stated criteria, not style the checks already settle. You may install dependencies, run commands, tests and the application in this copy; an edit here is yours alone and never reaches the branch, so a fix you want is a finding, not a commit.",
  `Task under review: ${f.task.title}`,
  `Protocol: call ho_review exactly once with verdict approve or request_changes, numbered findings (file:line), and criteria: one judgement per acceptance criterion by its number — pass with what you ran or opened and saw, fail with what you saw instead, not_checked with why your stage does not cover it. The office keeps these as evidence on this commit and refuses approve while a criterion fails. Then stop. ${roundsGuide(f, model)}`,
];
