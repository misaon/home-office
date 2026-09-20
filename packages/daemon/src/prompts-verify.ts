import { type ReadModel, tasksOfMandate } from "@ho/core";
import { headline, type Mandate, type Task } from "@ho/protocol";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { environmentGuide } from "./prompts-environment.ts";
import {
  browserGuide,
  repoRules,
  SANDBOX,
  serveGuide,
  servicesGuide,
  type SessionFacts,
} from "./prompts-shared.ts";

const REPORT_HEADLINE_MAX = 160;

const METHOD =
  "Exercise every condition the way the human would: start the application when it has one, walk the flow, try the unhappy paths the condition implies, check the narrow viewport and keyboard access when it is about a screen, and compare what you see with the request's own words, never with the developers' reports. Judge the integrated result as a whole: two tasks that each pass alone but disagree on an interface fail here. A condition you could not exercise is a fail with the reason, not a pass.";

const CALIBRATION =
  "Acceptable evidence names the exact command or page, the input you gave and the output you observed, with a screenshot for anything visual; unacceptable evidence says it looks fine, points at code that exists, or restates a report. Read the skill verify-request before you start: it carries the checklist for web applications with examples of both.";

const PROTOCOL =
  "Protocol: call ho_verify exactly once with verdict pass or fail, one judgement per condition by its number, the task criteria your briefing lists as unverified with their task id, and your screenshots in files; then stop. You change nothing in this copy, and nothing you change reaches the branch: a fix you want is a finding in your summary.";

const taskLine = (model: ReadModel, task: Task): string => {
  const who =
    task.assigneeId === undefined ? "unassigned" : model.agents.get(task.assigneeId)?.name;
  const report =
    task.artifacts.report === undefined
      ? ""
      : `: ${headline(task.artifacts.report, REPORT_HEADLINE_MAX)}`;
  return `- "${task.title}" by ${who ?? "a former colleague"} (${task.artifacts.branch ?? "no branch"} at ${task.artifacts.commit ?? "no commit"})${report}`;
};

const conditions = (mandate: Mandate): string =>
  mandate.acceptance.length === 0
    ? "Conditions: the briefing states none beyond the request itself; judge the request as written and report it as condition 1."
    : `Conditions to verify, by number:\n${mandate.acceptance
        .map((criterion, index) => `${String(index + 1)}. ${criterion.text}`)
        .join("\n")}`;

export const verifyPrompt = (f: SessionFacts, model: ReadModel): string[] => {
  const mandate = f.task.mandateId === undefined ? undefined : model.mandates.get(f.task.mandateId);
  if (mandate === undefined) {
    return [
      `You verify the result checked out at ${REPO_IN_VOLUME} against the briefing that follows; end with ho_verify.`,
      SANDBOX,
      PROTOCOL,
    ];
  }
  const work = tasksOfMandate(model, mandate).filter(
    (task) => task.kind === "work" && task.status === "done",
  );
  return [
    `You are the independent verifier of the request "${mandate.title}". Every task for it is done and reviewed; your job is to prove, on the integrated result checked out at ${REPO_IN_VOLUME} (branch ${f.branch}, commit ${f.commit ?? "at the tip"}, base branch ${f.project.defaultBranch}), that the request as the human made it holds.`,
    SANDBOX,
    repoRules(f.agent),
    browserGuide(f.browser, true),
    serveGuide(f.preview, f.browser),
    servicesGuide(f.services),
    environmentGuide(f, model),
    `The request, as the human wrote it:\n${mandate.request}`,
    conditions(mandate),
    `Tasks that make up the result:\n${work.map((task) => taskLine(model, task)).join("\n")}`,
    METHOD,
    CALIBRATION,
    `Start with \`git -C ${REPO_IN_VOLUME} diff ${f.project.defaultBranch}...HEAD --stat\` to see what changed as a whole, then exercise; read code only to explain a failure.`,
    PROTOCOL,
  ];
};
