import { membersOf, type ReadModel, sessionsOfAgent } from "@ho/core";
import {
  type Agent,
  type Attachment,
  CHAT_INBOX_DIR,
  CHAT_OUTBOX_DIR,
  clip,
  type CommitSha,
  isSessionActive,
  type Project,
  ROLE_TITLE,
  type Session,
  type Task,
} from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import type { EnvironmentReport } from "./environment-report.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import type { LspLanguage } from "./skill-pack.ts";

export type Services =
  | { kind: "off" }
  | { kind: "ready" }
  | { kind: "failed"; message: string }
  | { kind: "untrusted" };

export type WorkBase = {
  title: string;
  branch: string;
  commit: CommitSha | null;
  others: readonly string[];
};

type Preview = { enabled: boolean; port: number };

export type DiffSummary = { files: number; insertions: number; deletions: number };

export type SessionFacts = {
  agent: Agent;
  project: Project;
  task: Task;
  files: readonly Attachment[];
  mode: Session["mode"];
  branch: string;
  commit: CommitSha | null;
  base: WorkBase | null;
  diff: DiffSummary | null;
  languages: readonly LspLanguage[];
  browser: boolean;
  preview: Preview;
  services: Services;
  environment: EnvironmentReport | null;
};

export const SANDBOX =
  "Sandbox: only /work and /tmp are writable; the rest of the filesystem, including your home directory, is read-only. Package caches already point into /work/.cache and survive between your sessions on this task. The git remote is a path this sandbox cannot reach, so fetch, pull and push fail, and there is no gh; the office moves commits for you. Nothing runs here besides what this briefing lists: no Docker engine unless a Services line says so, so do not spend turns probing for one. Databases: PostgreSQL 17, MariaDB, Redis and SQLite are installed but not running; `ho-db postgres start`, `ho-db mariadb start` or `ho-db redis start` brings one up on 127.0.0.1 at its default port without a password (user agent for PostgreSQL, root for MariaDB), keeps its data under /work/.db across your sessions on this task and prints the connection URL; `ho-db <engine> status` and `stop` exist too. Each shell command runs in a fresh shell, so a variable or a background job from one command is gone in the next.";

const LSP_NAMES: Readonly<Record<LspLanguage, string>> = {
  typescript: "TypeScript and JavaScript",
  python: "Python",
  php: "PHP",
};

export const lspGuide = (languages: readonly LspLanguage[]): string =>
  languages.length === 0
    ? ""
    : `Code navigation: the LSP tool is on for ${languages.map((language) => LSP_NAMES[language]).join(", ")} — go to definition, find references, hover for types, and diagnostics pushed to you after every edit. Use it for symbol lookups instead of grep, and fix the diagnostics it reports before you move on.`;

export const repoRules = (agent: Agent): string =>
  agent.provider === "claude-code"
    ? "House rules: this repository's CLAUDE.md, .claude/rules and .claude/skills are loaded for you; follow them over your habits. If the repository has an AGENTS.md that CLAUDE.md does not import, read it first and treat it the same way."
    : "House rules: read the repository's CLAUDE.md and AGENTS.md at the root before you start, unless your runtime already loaded them, and follow them over your habits.";

const SHOW_THE_HUMAN = `Take a screenshot of every change a user can see, copy it into ${CHAT_OUTBOX_DIR} and name it in ho_report's files: the human then sees the result in the office chat.`;

export const browserGuide = (enabled: boolean, reportsFiles: boolean): string =>
  enabled
    ? `Browser: headless Chromium with the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_take_screenshot and more); there is no display. Screenshots land in ${BROWSER_OUTPUT_DIR}; copy the ones that belong in the repository into the repository before committing.${reportsFiles ? ` ${SHOW_THE_HUMAN}` : ""} Close pages you no longer need.`
    : "";

const LEAVE_RUNNING =
  "Leave a server you started running: the container ends with your session and the office's checks run in their own container, so stopping it only costs turns.";

export const serveGuide = (preview: Preview, browser: boolean): string => {
  if (preview.enabled) {
    const port = String(preview.port);
    return `Serving: bind a server you start to 0.0.0.0:${port}, not 127.0.0.1, or only you will see it; the human reaches it at http://127.0.0.1:${port}${browser ? ", and so do your browser tools" : ""}. That port is the only one that leaves the sandbox. ${LEAVE_RUNNING}`;
  }
  return browser
    ? `Serving: nothing you serve leaves this sandbox. Start dev servers on 127.0.0.1 and open them at http://127.0.0.1:<port> with your browser tools; send the human a screenshot rather than a local URL. ${LEAVE_RUNNING}`
    : "Serving: nothing you serve leaves this sandbox, so never tell the human to open a local URL.";
};

export const CHAT_STYLE =
  "Chat style: what you send with ho_reply is Markdown in the office chat, read by a human at a glance. Bold the decision and task titles, put paths, branches, commands and identifiers in `code`, start a status line with one fitting emoji (👉 handed over, 🔧 in progress, 🔍 in review, ✅ done, 🚧 blocked, ❌ failed, ❓ question), use short bullet lists for plans, and no headings. One emoji per line at most; the text still has to read well without them.";

const SERVICES_UNTRUSTED =
  "Services: this floor asks for a private container engine, but the human has not marked the repository as trusted, and the engine runs as a privileged container, so the office did not start it. Do not run docker or docker compose; if the task needs them, report that as the blocker and name the trust setting.";

const SERVICES_READY = `Services: this task has its own Docker engine — \`docker\`, \`docker compose\` and \`docker buildx\` reach only it, never the host. Run the repository's own compose file from ${REPO_IN_VOLUME} as written; published ports answer on 127.0.0.1 inside this sandbox. Per-service limits such as mem_limit are accepted but not enforced: the engine has one memory limit for the whole environment, and passing it kills every service at once. Images, build cache and service volumes survive for the next session of this task, and the office's final check runs against the same cache without network, so pull every image the checks need while you work.`;

export const servicesGuide = (services: Services): string => {
  if (services.kind === "off") {
    return "";
  }
  if (services.kind === "untrusted") {
    return SERVICES_UNTRUSTED;
  }
  if (services.kind === "failed") {
    return `Services: this project expects a private container engine, but it did not start (${services.message}). Do not run docker or docker compose; if the task needs them, report that as the blocker.`;
  }
  return SERVICES_READY;
};

export const dependenciesGuide = (base: WorkBase | null): string => {
  if (base === null) {
    return "";
  }
  const at = base.commit === null ? "" : ` at commit ${base.commit}`;
  const others =
    base.others.length === 0
      ? ""
      : ` The other branches this task builds on are fetched into this repository as ${base.others.join(", ")}; merge what you need.`;
  return `This task builds on "${base.title}" (branch ${base.branch}${at}): your branch starts from that result, so it is already in your tree.${others} The checks and the reviewers judge the combined result against the request, not your commits alone.`;
};

export const filesGuide = (files: readonly Attachment[]): string =>
  files.length === 0
    ? ""
    : `Files in ${CHAT_INBOX_DIR}, read-only, from the human and from colleagues' reports on this request: ${files.map((f) => f.name).join(", ")}.`;

export const authorClaims = (model: ReadModel, task: Task): ReadonlyMap<number, string> => {
  const mandate = task.mandateId === undefined ? undefined : model.mandates.get(task.mandateId);
  const { commit } = task.artifacts;
  const claims = new Map<number, string>();
  if (mandate === undefined || commit === undefined) {
    return claims;
  }
  for (const entry of mandate.evidence) {
    if (
      entry.taskId === task.id &&
      entry.method === "author" &&
      entry.commit === commit &&
      entry.criterion !== null
    ) {
      claims.set(entry.criterion, entry.proof);
    }
  }
  return claims;
};

const CLAIM_CHARS = 300;

export const criteriaGuide = (
  task: Task,
  lead: string,
  claims: ReadonlyMap<number, string> = new Map(),
): string =>
  task.spec === undefined
    ? ""
    : `${lead}\n${task.spec.acceptanceCriteria
        .map((criterion, index) => {
          const claim = claims.get(index);
          const own =
            claim === undefined
              ? ""
              : `\n   The author's own check, a claim to confirm rather than evidence: ${clip(claim, CLAIM_CHARS)}`;
          return `${String(index + 1)}. ${criterion}${own}`;
        })
        .join("\n")}`;

const SMALL_CHANGE_LINES = 60;
const MEDIUM_CHANGE_LINES = 400;

export const changeSizeGuide = (diff: DiffSummary | null, defaultBranch: string): string => {
  if (diff === null) {
    return "";
  }
  const lines = diff.insertions + diff.deletions;
  const effort =
    lines <= SMALL_CHANGE_LINES
      ? "a small change: one careful pass over the diff, the checks or the one page it touches, and your verdict, in about fifteen turns; do not reinstall or rebuild what the environment already prepared"
      : lines <= MEDIUM_CHANGE_LINES
        ? "a medium change: read every hunk, run the checks once and exercise each criterion once, in about thirty turns"
        : "a large change: read it module by module and spend your turns on the criteria first";
  return `Size of the change against ${defaultBranch}: ${String(diff.files)} file(s), +${String(diff.insertions)} −${String(diff.deletions)}. That is ${effort}.`;
};

export const rosterLines = (model: ReadModel, project: Project, except: Agent["id"]): string[] =>
  membersOf(model, project.id)
    .filter((agent) => agent.id !== except)
    .map(
      (agent) =>
        `- ${agent.name} (${ROLE_TITLE[agent.role]}, skills: ${agent.skillPack}, active sessions: ${String(
          sessionsOfAgent(model, agent.id).filter((s) => isSessionActive(s.state)).length,
        )})`,
    );

export const REVIEW_FLAGS =
  "Set qa and security deliberately on every ho_delegate: qa true when a tester can exercise behaviour — a flow, a form, an API or data change, anything with states to walk through — and false for content, copy, styling, documentation, configuration and refactors, where the head of development checks the result in the browser without a separate QA pass; security true when the change touches authentication, authorisation, input handling, secrets, cryptography, network exposure, dependencies or a hot path where performance matters. The head of development reviews every task last. A flag names a role this floor must have: when nobody holds it, ho_delegate refuses, and you either hire that role first or set the flag false and say why in context. A review is never skipped silently.";
