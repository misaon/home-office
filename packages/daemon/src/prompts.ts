import { isSessionActive, type ReadModel } from "@ho/core";
import type { Agent, Project, Session, Task, TaskNote } from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";

const browserGuide = (enabled: boolean): string =>
  enabled
    ? `Browser: this sandbox has headless Chromium with the Playwright MCP server (browser_* tools: navigate, click, type, snapshot, take_screenshot) and the Chrome DevTools MCP server (performance traces, network, console). Bun, Node and npm are installed. Start dev servers on 127.0.0.1 inside the sandbox and open them at http://127.0.0.1:<port>; there is no display and no access to the host. Screenshots are written to ${BROWSER_OUTPUT_DIR}; copy the ones that belong in the repository into it before committing. Close pages you no longer need.`
    : "";

type Model = Pick<ReadModel, "agents" | "projects" | "tasks" | "sessions">;

const common = (agent: Agent, project: Project): string[] => [
  `You are ${agent.name}, a ${agent.role} at Home Office${project.repo.kind === "none" ? "" : ` working on the project "${project.name}"`}.`,
  agent.basePrompt.trim(),
  "Keep tool output small: prefer targeted reads and greps over dumping files. Never print secrets.",
];

const workProtocol = [
  "Protocol: when the work is committed, call the MCP tool ho_report (status review or blocked, summary under 1500 characters) and stop.",
  "If you are truly stuck on a decision only the human can make, commit what you have and call ho_ask_human, then stop; you will be resumed with the answer.",
  "If a colleague is better suited, commit and call ho_handoff with a clear brief, then stop.",
  "Do not push; do not open pull requests; do not leave uncommitted changes when you report.",
];

export const workPrompt = (
  agent: Agent,
  project: Project,
  task: Task,
  branch: string,
  browser: boolean,
): string =>
  [
    ...common(agent, project),
    `The repository is checked out at ${REPO_IN_VOLUME} on branch ${branch}. Work only inside it.`,
    "Commit your changes with clear Conventional Commit messages.",
    browserGuide(browser),
    `Task: ${task.title}`,
    ...workProtocol,
  ]
    .filter((line) => line !== "")
    .join("\n");

export const reviewPrompt = (
  agent: Agent,
  project: Project,
  task: Task,
  branch: string,
  browser: boolean,
): string =>
  [
    ...common(agent, project),
    `You are reviewing branch ${branch} of the repository at ${REPO_IN_VOLUME} (base branch: ${project.defaultBranch}).`,
    browserGuide(browser),
    `Start with \`git -C ${REPO_IN_VOLUME} diff ${project.defaultBranch}...HEAD --stat\` and then the full diff; read surrounding code only where needed.`,
    "Check correctness, safety, adherence to the task brief and the repository's conventions; do not modify files.",
    `Task under review: ${task.title}`,
    "Protocol: call the MCP tool ho_review exactly once with verdict approve or request_changes and numbered findings (file:line), then stop.",
  ]
    .filter((line) => line !== "")
    .join("\n");

export const triagePrompt = (agent: Agent, office: Project, model: Model): string => {
  const active = [...model.sessions.values()].filter((s) => isSessionActive(s.state));
  const roster = [...model.agents.values()]
    .filter((a) => a.id !== agent.id)
    .map(
      (a) =>
        `- ${a.name} (${a.role}, skills: ${a.skillPack}, projects: ${a.projectIds.map((p) => model.projects.get(p)?.name ?? p).join(", ") || "none"}, active sessions: ${String(active.filter((s) => s.agentId === a.id).length)})`,
    );
  const projects = [...model.projects.values()]
    .filter((p) => p.repo.kind !== "none")
    .map(
      (p) =>
        `- ${p.name} (default branch ${p.defaultBranch}, open tasks: ${String([...model.tasks.values()].filter((t) => t.projectId === p.id && t.status !== "done" && t.status !== "cancelled").length)})`,
    );
  return [
    ...common(agent, office),
    "You run the office. The human writes to you in the office chat; you turn requests into well-specified tasks for your team.",
    `Team:\n${roster.join("\n") || "- (no other agents yet)"}`,
    `Projects:\n${projects.join("\n") || "- (no projects with repositories yet)"}`,
    "Protocol: for actionable requests call ho_delegate once per independent piece of work (clear title, brief with goal, acceptance criteria and constraints; assign a member of that project when one fits). Use ho_reply for questions back, a one-line plan, or an answer when there is nothing to delegate. Use ho_list_agents / ho_list_projects when unsure. Finish with ho_report (status done, one-line summary) and stop.",
    "Mail: some requests arrive as GitHub issues the postman brought in; their brief starts with the issue number, the project name and the link. Delegate them to that project (quote the issue link in the brief). If an issue is too vague to act on, finish with ho_report status blocked and say what is missing; the issue author gets that as a comment, ho_reply does not reach them.",
    "You do not write code yourself and you have no repository here.",
  ]
    .filter((line) => line !== "")
    .join("\n");
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
