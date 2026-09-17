import { membersOf, type ReadModel, sessionsOfAgent, tasksOf, verifyAttempts } from "@ho/core";
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

export type Services = { kind: "off" } | { kind: "ready" } | { kind: "failed"; message: string };

type Preview = { enabled: boolean; port: number };

type SessionFacts = {
  agent: Agent;
  project: Project;
  task: Task;
  files: readonly Attachment[];
  mode: Session["mode"];
  branch: string;
  browser: boolean;
  preview: Preview;
  services: Services;
};

const SANDBOX =
  "Sandbox: only /work and /tmp are writable; the rest of the filesystem, including your home directory, is read-only. Package caches already point into /work/.cache and survive between your sessions on this task. The git remote is a path this sandbox cannot reach, so fetch, pull and push fail, and there is no gh; the office moves commits for you.";

const repoRules = (agent: Agent): string =>
  agent.provider === "claude-code"
    ? "House rules: this repository's CLAUDE.md, .claude/rules and .claude/skills are loaded for you; follow them over your habits. If the repository has an AGENTS.md that CLAUDE.md does not import, read it first and treat it the same way."
    : "House rules: read the repository's CLAUDE.md and AGENTS.md at the root before you start, unless your runtime already loaded them, and follow them over your habits.";

const browserGuide = (enabled: boolean): string =>
  enabled
    ? `Browser: headless Chromium with the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_take_screenshot and more); there is no display. Screenshots land in ${BROWSER_OUTPUT_DIR}; copy the ones that belong in the repository into the repository before committing. Close pages you no longer need.`
    : "";

const serveGuide = (preview: Preview, browser: boolean): string => {
  if (preview.enabled) {
    const port = String(preview.port);
    return `Serving: bind a server you start to 0.0.0.0:${port}, not 127.0.0.1, or only you will see it; the human reaches it at http://127.0.0.1:${port}${browser ? ", and so do your browser tools" : ""}. That port is the only one that leaves the sandbox.`;
  }
  return browser
    ? "Serving: nothing you serve leaves this sandbox. Start dev servers on 127.0.0.1 and open them at http://127.0.0.1:<port> with your browser tools; send the human a screenshot rather than a local URL."
    : "Serving: nothing you serve leaves this sandbox, so never tell the human to open a local URL.";
};

const servicesGuide = (services: Services): string => {
  if (services.kind === "off") {
    return "";
  }
  if (services.kind === "failed") {
    return `Services: this project expects a private container engine, but it did not start (${services.message}). Do not run docker or docker compose; if the task needs them, report that as the blocker.`;
  }
  return `Services: this task has its own Docker engine — \`docker\`, \`docker compose\` and \`docker buildx\` reach only it, never the host. Run the repository's own compose file from ${REPO_IN_VOLUME} as written; published ports answer on 127.0.0.1 inside this sandbox. Per-service limits such as mem_limit are accepted but not enforced: the engine has one memory limit for the whole environment, and passing it kills every service at once. Images, build cache and service volumes survive for the next session of this task.`;
};

const filesGuide = (files: readonly Attachment[]): string =>
  files.length === 0
    ? ""
    : `Files from the human, read-only in ${CHAT_INBOX_DIR}: ${files.map((f) => f.name).join(", ")}.`;

const skillsGuide = (agent: Agent): string =>
  agent.provider === "claude-code" || agent.skillPack === "none"
    ? ""
    : "Skills: call ho_list_skills once at the start for the short index of what you know, then ho_get_skill for the one that matches the work, and ho_get_skill_file only where that skill sends you. Do not read them all.";

const common = (agent: Agent, project: Project): string[] => [
  `You are ${agent.name}, ${agent.role === "boss" ? "the boss of" : `a ${agent.role} on`} the floor "${project.name}" at Home Office (one floor per project; this floor's repository is "${project.name}").`,
  agent.basePrompt.trim(),
  "Keep tool output small: prefer targeted reads and greps over dumping files. Never print secrets.",
  skillsGuide(agent),
];

const verifyGuide = (project: Project, task: Task): string => {
  if (project.verify.command === "") {
    return "";
  }
  const left = Math.max(0, project.verify.maxAttempts - verifyAttempts(task));
  return `Done means \`${project.verify.command}\` passes. Run it yourself before you report. The office runs it again on your commits in a container with no network and an empty home directory, so everything the command needs must live under ${REPO_IN_VOLUME}; a failure comes back to you with the output, ${String(left)} more time(s) before the task is blocked.`;
};

const budgetGuide = (agent: Agent): string =>
  `Budget: ${String(agent.budgets.maxTurnsPerTask)} tool turns and ${String(agent.budgets.maxWallMinutes)} minutes for this session. Commit at every working checkpoint: uncommitted changes are lost when the budget runs out, committed ones are kept for the next session.`;

const criteriaGuide = (task: Task, lead: string): string =>
  task.spec === undefined
    ? ""
    : `${lead}\n${task.spec.acceptanceCriteria.map((c, i) => `${String(i + 1)}. ${c}`).join("\n")}`;

const workPublish = (task: Task, project: Project): string =>
  (task.publish ?? project.publish.mode) === "pull-request"
    ? "Publishing: the office pushes the task branch and opens the pull request once the checks pass; your report becomes its description."
    : "Publishing: the office pushes the task branch; this floor does not open pull requests, so do not promise one.";

const WORK_PROTOCOL = [
  "Protocol: when the work is committed, call ho_report with status review and stop; leave nothing uncommitted. If you are stuck on a decision only the human can make, commit what you have, call ho_ask_human and stop; you are resumed with the answer. If a colleague on this floor is better suited, commit and call ho_handoff with a clear brief.",
  "When things go wrong: a tool error names what was wrong with the call, so fix the input and retry once, then report blocked with the message. If the branch already contains the work, verify it and report review saying so. If the brief is wrong rather than unclear, ask the human instead of guessing. If you find a credential in the repository, leave it in place, never print it, and name the file in your report.",
];

const workPrompt = (f: SessionFacts): string[] => [
  `The repository is checked out at ${REPO_IN_VOLUME} on branch ${f.branch}. Work only inside it and commit with clear Conventional Commit messages.`,
  SANDBOX,
  repoRules(f.agent),
  browserGuide(f.browser),
  serveGuide(f.preview, f.browser),
  servicesGuide(f.services),
  `Task: ${f.task.title}`,
  criteriaGuide(f.task, "You are done when every one of these holds:"),
  verifyGuide(f.project, f.task),
  budgetGuide(f.agent),
  workPublish(f.task, f.project),
  filesGuide(f.files),
  ...WORK_PROTOCOL,
];

const reviewRounds = (f: SessionFacts, model: ReadModel): string => {
  const worker = f.task.assigneeId === undefined ? undefined : model.agents.get(f.task.assigneeId);
  const left = (worker?.budgets.maxReviewRounds ?? 0) - f.task.reviewRounds;
  return left <= 0
    ? "This is the last round: request_changes now blocks the task for the human, so use it only for defects that must not merge."
    : `request_changes sends the work back to the author; it can do so ${String(left)} more time(s) before the task is blocked.`;
};

const reviewPrompt = (f: SessionFacts, model: ReadModel): string[] => [
  `You are reviewing branch ${f.branch} of the repository at ${REPO_IN_VOLUME} (base branch: ${f.project.defaultBranch}).`,
  SANDBOX,
  repoRules(f.agent),
  browserGuide(f.browser),
  serveGuide(f.preview, f.browser),
  servicesGuide(f.services),
  `Start with \`git -C ${REPO_IN_VOLUME} diff ${f.project.defaultBranch}...HEAD --stat\`, then the diff file by file; read surrounding code only where needed. If ${f.project.defaultBranch} is missing locally, review the branch's own commits with \`git log -p\`.`,
  f.project.verify.command === ""
    ? ""
    : `The office already ran \`${f.project.verify.command}\` on this branch and it passed; review what the checks cannot see.`,
  criteriaGuide(f.task, "Judge each acceptance criterion; approve only when every one holds:"),
  "Check correctness, safety and the repository's conventions; flag only what affects correctness or the stated criteria, not style the checks already settle. Do not modify files.",
  `Task under review: ${f.task.title}`,
  `Protocol: call ho_review exactly once with verdict approve or request_changes and numbered findings (file:line), then stop. ${reviewRounds(f, model)}`,
];

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
    `Team on this floor:\n${
      roster.join("\n") ||
      (f.project.hiring.enabled
        ? "- nobody yet: hire whoever the work needs, or take it yourself when it is small"
        : "- nobody yet: you do the work yourself")
    }`,
    f.project.hiring.enabled
      ? "Hiring: when nobody on this floor fits the work, call ho_hire once for a colleague who will stay and take later work too, then delegate to them by name. Match the model to the job — a cheap one for mechanical edits, a strong one for design. Do not hire for a single errand you can do yourself."
      : "",
    `Protocol: for actionable requests call ho_delegate once per independently verifiable piece of work, ${
      staff.length === 0
        ? "with assignee set to your own name; you get a separate work session in the repository for each"
        : "assignee = the colleague who fits best (your own name only when nobody fits)"
    }. Its fields are the specification, so fill them as they are described. If you cannot write a checkable criterion, the request is still a question: ask with ho_reply instead of delegating. Use ho_reply for questions back, a one-line plan, or an answer when there is nothing to delegate. Finish with ho_report (status done, one-line summary) and stop.`,
    f.browser
      ? "Browser: set browser: true on a task only when its result must be seen in a browser (UI work, screenshots); the worker and the reviewer then get headless Chromium."
      : "",
    f.project.publish.mode === "pull-request"
      ? "Delivery: finished work is pushed and a pull request opens by itself. Tell the human the branch; the pull request link arrives when it is ready, or call ho_publish to push and open it now."
      : "Delivery: this floor only pushes the branch. When the human asks for a pull request, pass publish: pull-request to ho_delegate and one opens as soon as that task finishes — what they asked for outranks the floor's default. For work already finished, call ho_publish instead.",
    filesGuide(f.files),
    `Files: to send the human an image or a document, write it into ${CHAT_OUTBOX_DIR} and name the file in ho_reply's \`files\`. Screenshots the browser tools take land in ${BROWSER_OUTPUT_DIR}; copy the one you mean across. Accepted: png, jpg, gif, webp, pdf, txt, md, json, csv, up to 10 MB each.`,
    "Mail: some requests arrive as GitHub issues the postman brought to the reception; their brief starts with the issue number and the link. Quote the issue link in the brief. If an issue is too vague to act on, finish with ho_report status blocked and say what is missing; the issue author gets that as a comment, ho_reply does not reach them.",
  ];
};

export const systemPrompt = (facts: SessionFacts, model: ReadModel): string => {
  const body =
    facts.mode === "review"
      ? reviewPrompt(facts, model)
      : facts.mode === "triage"
        ? triagePrompt(facts, model)
        : workPrompt(facts);
  return [...common(facts.agent, facts.project), ...body].filter((line) => line !== "").join("\n");
};

const taskBrief = (task: Task): string =>
  task.brief.trim() === "" ? task.title : `${task.title}\n\n${task.brief}`;

const formatNote = (note: TaskNote): string => `- [${note.kind}] ${note.text}`;

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
  const head = `Continue the task "${task.title}". Your previous session ended; the brief follows, then what happened since.\n\nBrief:\n${task.brief.trim() === "" ? task.title : task.brief}`;
  return since.length === 0
    ? `${head}\n\nPick up where you left off and finish with ho_report.`
    : `${head}\n\nSince your last session:\n${since.map((n) => formatNote(n)).join("\n")}\n\nAddress these, commit, then finish with ho_report.`;
};
