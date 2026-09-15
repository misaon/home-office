import { membersOf, type ReadModel, sessionsOfAgent, tasksOf } from "@ho/core";
import {
  type Agent,
  type Attachment,
  CHAT_INBOX_DIR,
  CHAT_OUTBOX_DIR,
  isSessionActive,
  type Project,
  type Session,
  type Task,
  type TaskNote,
} from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";

/** Whether this session got the private container engine its project asks for. */
export type Services = { kind: "off" } | { kind: "ready" } | { kind: "failed"; message: string };

const browserGuide = (enabled: boolean): string =>
  enabled
    ? `Browser: this sandbox has headless Chromium with the Playwright MCP server (browser_* tools: navigate, click, type, snapshot, take_screenshot) and may expose Chrome DevTools MCP when enabled in daemon settings; only use tools actually available in this session. Bun, Node and npm are installed. Start dev servers on 127.0.0.1 inside the sandbox and open them at http://127.0.0.1:<port>; there is no display and no access to the host. Screenshots are written to ${BROWSER_OUTPUT_DIR}; copy the ones that belong in the repository into it before committing. Close pages you no longer need.`
    : "";

const servicesGuide = (services: Services): string => {
  if (services.kind === "off") {
    return "";
  }
  if (services.kind === "failed") {
    return `Services: this project expects a private container engine, but it did not start (${services.message}). Do not run docker or docker compose; if the task needs them, report that as the blocker.`;
  }
  return `Services: this task has its own Docker engine — \`docker\`, \`docker compose\` and \`docker buildx\` reach only it, never the host. Run the repository's own compose file from ${REPO_IN_VOLUME} as written; published ports answer on 127.0.0.1 inside this sandbox. Per-service limits such as mem_limit are accepted but not enforced: the engine has one memory limit for the whole environment, and passing it kills every service at once. Images, build cache and service volumes survive for the next session of this task.`;
};

/** What the human attached to this task, as the session sees it. */
const filesGuide = (files: readonly Attachment[]): string =>
  files.length === 0
    ? ""
    : `Files from the human, read-only in ${CHAT_INBOX_DIR}: ${files.map((f) => f.name).join(", ")}.`;

const common = (agent: Agent, project: Project): string[] => [
  `You are ${agent.name}, ${agent.role === "boss" ? "the boss of" : `a ${agent.role} on`} the floor "${project.name}" at Home Office (one floor per project; this floor's repository is "${project.name}").`,
  agent.basePrompt.trim(),
  "Keep tool output small: prefer targeted reads and greps over dumping files. Never print secrets.",
];

/**
 * The floor's own checks, named in the prompt so finishing has a definition the agent can act on rather
 * than judge. MAST attributes 23.5 % of multi-agent failures to verification, premature termination
 * among them (arXiv 2503.13657, read 2026-09-15).
 */
const verifyGuide = (project: Project): string =>
  project.verify.command === ""
    ? ""
    : `Done means \`${project.verify.command}\` passes. Run it yourself before you report; the office runs it again on your commits and sends the work back to you with the output if it fails.`;

const WORK_PROTOCOL = [
  "Protocol: when the work is committed, call the MCP tool ho_report (status review or blocked, summary under 1500 characters) and stop.",
  "If you are truly stuck on a decision only the human can make, commit what you have and call ho_ask_human, then stop; you will be resumed with the answer.",
  "If a colleague on this floor is better suited, commit and call ho_handoff with a clear brief, then stop.",
  "Do not push; do not open pull requests; do not leave uncommitted changes when you report.",
];

type SessionFacts = {
  agent: Agent;
  project: Project;
  task: Task;
  /** What the human attached to this task's messages; the sandbox has them read-only. */
  files: readonly Attachment[];
  mode: Session["mode"];
  branch: string;
  browser: boolean;
  services: Services;
};

const workPrompt = (f: SessionFacts): string[] => [
  `The repository is checked out at ${REPO_IN_VOLUME} on branch ${f.branch}. Work only inside it.`,
  "Commit your changes with clear Conventional Commit messages.",
  browserGuide(f.browser),
  servicesGuide(f.services),
  `Task: ${f.task.title}`,
  verifyGuide(f.project),
  filesGuide(f.files),
  ...WORK_PROTOCOL,
];

const reviewPrompt = (f: SessionFacts): string[] => [
  `You are reviewing branch ${f.branch} of the repository at ${REPO_IN_VOLUME} (base branch: ${f.project.defaultBranch}).`,
  browserGuide(f.browser),
  servicesGuide(f.services),
  `Start with \`git -C ${REPO_IN_VOLUME} diff ${f.project.defaultBranch}...HEAD --stat\` and then the full diff; read surrounding code only where needed.`,
  verifyGuide(f.project) === ""
    ? ""
    : `The office already ran \`${f.project.verify.command}\` on this branch and it passed; review what the checks cannot see.`,
  "Check correctness, safety, adherence to the task brief and the repository's conventions; do not modify files.",
  `Task under review: ${f.task.title}`,
  "Protocol: call the MCP tool ho_review exactly once with verdict approve or request_changes and numbered findings (file:line), then stop.",
];

/** The boss plans a chat message or a mail item for his floor: the roster is this floor's staff, nobody else. */
const triagePrompt = (f: SessionFacts, model: ReadModel): string[] => {
  const staff = membersOf(model, f.project.id).filter((a) => a.id !== f.agent.id);
  const roster = staff.map(
    (a) =>
      `- ${a.name} (${a.role}, skills: ${a.skillPack}, active sessions: ${String(
        sessionsOfAgent(model, a.id).filter((s) => isSessionActive(s.state)).length,
      )})`,
  );
  const open = tasksOf(model, f.project.id).filter(
    (t) => t.kind === "work" && t.status !== "done" && t.status !== "cancelled",
  ).length;
  return [
    `You run this floor. The human writes to you in the floor's chat; you turn requests into well-specified tasks for your team. The repository is checked out at ${REPO_IN_VOLUME} (branch ${f.project.defaultBranch}, ${String(open)} open task(s)) for planning only: read what you need to write precise briefs, do not modify or commit anything here — work happens in separate sessions.`,
    `Team on this floor:\n${roster.join("\n") || "- nobody yet: you do the work yourself"}`,
    staff.length === 0
      ? "Protocol: for actionable requests call ho_delegate once per independent piece of work with a clear title and a brief (goal, acceptance criteria, constraints) and assignee set to your own name; you will get a separate work session in the repository for each. Use ho_reply for questions back, a one-line plan, or an answer when there is nothing to do. Finish with ho_report (status done, one-line summary) and stop."
      : "Protocol: for actionable requests call ho_delegate once per independent piece of work (clear title, brief with goal, acceptance criteria and constraints, assignee = the colleague who fits best; use your own name only when nobody fits). Use ho_reply for questions back, a one-line plan, or an answer when there is nothing to delegate. Use ho_list_agents when unsure. Finish with ho_report (status done, one-line summary) and stop.",
    filesGuide(f.files),
    `Files: to send the human an image or a document, write it into ${CHAT_OUTBOX_DIR} and name the file in ho_reply's \`files\`. Screenshots the browser tools take land in ${BROWSER_OUTPUT_DIR}; copy the one you mean across. Accepted: png, jpg, gif, webp, pdf, txt, md, json, csv, up to 10 MB each.`,
    "Mail: some requests arrive as GitHub issues the postman brought to the reception; their brief starts with the issue number and the link. Quote the issue link in the brief. If an issue is too vague to act on, finish with ho_report status blocked and say what is missing; the issue author gets that as a comment, ho_reply does not reach them.",
  ];
};

/** The system prompt appendix of a session: who the agent is, where the repository is, how to finish. */
export const systemPrompt = (facts: SessionFacts, model: ReadModel): string => {
  const body =
    facts.mode === "review"
      ? reviewPrompt(facts)
      : facts.mode === "triage"
        ? triagePrompt(facts, model)
        : workPrompt(facts);
  return [...common(facts.agent, facts.project), ...body].filter((line) => line !== "").join("\n");
};

const taskBrief = (task: Task): string =>
  task.brief.trim() === "" ? task.title : `${task.title}\n\n${task.brief}`;

const formatNote = (note: TaskNote): string => `- [${note.kind}] ${note.text}`;

/** First message of a session: the brief the first time, otherwise what happened since the agent last saw the task. */
export const openingMessage = (
  task: Task,
  mode: Session["mode"],
  previous: Session | undefined,
): string => {
  if (mode === "review") {
    const report = task.notes.findLast((n) => n.kind === "report");
    return `Review request for task "${task.title}".\n\nOriginal brief:\n${task.brief}\n\nAuthor's report:\n${report?.text ?? task.artifacts.report ?? "(none)"}`;
  }
  if (previous === undefined) {
    return taskBrief(task);
  }
  const since = task.notes.filter((n) => n.at >= previous.startedAt && n.kind !== "report");
  return since.length === 0
    ? `Continue the task "${task.title}". Your previous session ended; pick up where you left off and finish with ho_report.`
    : `Continue the task "${task.title}". Since your last session:\n${since.map((n) => formatNote(n)).join("\n")}\n\nAddress these, commit, then finish with ho_report.`;
};
