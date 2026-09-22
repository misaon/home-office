import { membersOf, type ReadModel, sessionsOfAgent } from "@ho/core";
import {
  type Agent,
  type Attachment,
  CHAT_INBOX_DIR,
  CHAT_OUTBOX_DIR,
  type ChatLanguage,
  clip,
  type CommitSha,
  isSessionActive,
  MECHANICAL_MAX_LINES,
  type Project,
  ROLE_TITLE,
  type Session,
  type Task,
} from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import type { EnvironmentReport } from "./environment-report.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import type { RepositoryLanguage } from "./skill-pack.ts";

export const LANGUAGE_GUIDE: Readonly<Record<ChatLanguage, string>> = {
  en: "Language: write to the human, your reports and your review findings in English.",
  cs: "Language: write to the human, your reports and your review findings in Czech; code, identifiers, paths, branch names and commit messages stay English.",
};

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
  languages: readonly RepositoryLanguage[];
  browser: boolean;
  preview: Preview;
  services: Services;
  environment: EnvironmentReport | null;
  network: "bridge" | "none";
  budget: { turns: number; wallMinutes: number };
};

export const SANDBOX =
  "Sandbox: only /work and /tmp are writable; the rest of the filesystem, including your home directory, is read-only. Package caches already point into /work/.cache, a cache every session on this floor shares, so what a colleague installed before is already warm for you. The git remote is a path this sandbox cannot reach, so fetch, pull and push fail, and there is no gh; the office moves commits for you. Nothing runs here besides what this briefing lists: no Docker engine unless a Services line says so, so do not spend turns probing for one. Databases: PostgreSQL 17, MariaDB, Redis and SQLite are installed but not running; `ho-db postgres start`, `ho-db mariadb start` or `ho-db redis start` brings one up on 127.0.0.1 at its default port without a password (user agent for PostgreSQL, root for MariaDB), keeps its data under /work/.db across your sessions on this task and prints the connection URL; `ho-db <engine> status` and `stop` exist too. Each shell command runs in a fresh shell, so a variable or a background job from one command is gone in the next.";

const applicationCapability = (f: SessionFacts): string => {
  const application = f.environment?.application ?? null;
  if (application !== null) {
    return application.ready
      ? `application started by the office${application.url === null ? "" : ` at ${application.url}`}`
      : "application start attempted by the office and not ready";
  }
  return f.project.environment.run === undefined
    ? "no run command configured, so nothing describes how to start the application"
    : `run command configured (\`${f.project.environment.run}\`), not started`;
};

export const capabilitiesGuide = (f: SessionFacts): string =>
  [
    "Capabilities, as the office set them up:",
    f.network === "none"
      ? "no outbound network"
      : "outbound internet yes (the git remote and gh excepted)",
    f.browser ? "browser yes" : "no browser",
    f.services.kind === "ready" ? "Docker engine yes" : "no Docker engine",
    "databases on demand with ho-db",
    f.preview.enabled ? `preview port ${String(f.preview.port)}` : "no preview port",
    applicationCapability(f),
  ].join(" · ");

export const FIDELITY_GUIDE =
  "Every criterion judgement carries fidelity: live when you exercised the running application (the one the office started, or the one you started with the environment's run command); substitute when you served a stand-in page, a mock or extracted markup instead; static when you judged from code, templates, build output or tests alone. Give via: the exact command or URL. When fidelity is not live, give blocker: not_prepared (the briefing describes no way to run it), not_attempted (a way existed and you did not use it; say why), or attempt_failed (you tried the described way and it failed; say how). A substitute is never presented as the application: never replace a link, an asset or a request with a placeholder and call it verified. Name the screenshots that back a judgement in its files, copied into /out/chat and listed in the call's files.";

const LSP_NAMES: Readonly<Record<RepositoryLanguage, string>> = {
  typescript: "TypeScript and JavaScript",
  python: "Python",
  php: "PHP",
  java: "Java",
};

export const lspGuide = (languages: readonly RepositoryLanguage[]): string =>
  languages.length === 0
    ? ""
    : `Code navigation: the LSP tool is on for ${languages.map((language) => LSP_NAMES[language]).join(", ")} — go to definition, find references, hover for types, and diagnostics pushed to you after every edit. Use it for symbol lookups instead of grep, and fix the diagnostics it reports before you move on.`;

const TOOLCHAIN_NOTES: Readonly<Partial<Record<RepositoryLanguage, string>>> = {
  java: "Java toolchain: JDK 21 is JAVA_HOME and on PATH; JDK 17 and JDK 25 are installed under /usr/lib/jvm/java-17-openjdk and /usr/lib/jvm/java-25-openjdk, where Gradle toolchains and Maven's toolchains.xml find them, so a project that asks for one of those versions builds without downloading anything. Build with the repository's own wrapper (./gradlew, ./mvnw) when it has one; gradle and mvn are installed for the rest. Gradle's user home is /work/.cache/gradle and Maven's local repository /work/.cache/maven/repository: both are shared by every session on this floor and mounted into the container that re-runs the check command, so what resolved once stays resolved, and a wrapper downloads its distribution into that cache the first time. Keep the project's own JVM memory settings and run one build at a time; the sandbox has a few GiB in total. Testcontainers and other suites that start containers need the Docker engine a Services line names; without one they cannot run here, so run the rest and say in your report which suites you could not.",
};

export const toolchainGuide = (languages: readonly RepositoryLanguage[]): string =>
  languages
    .flatMap((language) => {
      const note = TOOLCHAIN_NOTES[language];
      return note === undefined ? [] : [note];
    })
    .join(" ");

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
      claims.set(entry.criterion, `[${entry.fidelity}] ${entry.proof}`);
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

const MEDIUM_CHANGE_LINES = 400;

export const changeSizeGuide = (diff: DiffSummary | null, defaultBranch: string): string => {
  if (diff === null) {
    return "";
  }
  const lines = diff.insertions + diff.deletions;
  const effort =
    lines <= MECHANICAL_MAX_LINES
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

export const SHAPE_GUIDE =
  "Set shape on every ho_delegate: mechanical for a rename, a copy or link change, a dependency bump, a one-line fix, anything with no logic to get wrong; routine for an ordinary change with logic, layout or tests to get right; risky for authentication, authorisation, payments, data migrations, public APIs, anything hard to reverse or with security exposure. The office sizes the turn and time budgets, the effort and the depth of review by the shape (mechanical: 40 work turns, 25 review turns, 15 minutes a session; routine: 120, 40, 30; risky: 200, 60, 60, plus an independent verification of the whole result), and raises it when the diff turns out larger than the shape suggests.";

export const REVIEW_FLAGS =
  "Set qa and security deliberately on every ho_delegate: qa true when a tester can exercise behaviour — a flow, a form, an API or data change, anything with states to walk through — and false for content, copy, styling, documentation, configuration and refactors, where the head of development checks the result in the browser without a separate QA pass; security true when the change touches authentication, authorisation, input handling, secrets, cryptography, network exposure, dependencies or a hot path where performance matters. The head of development reviews every task last. A flag names a role this floor must have: when nobody holds it, ho_delegate refuses, and you either hire that role first or set the flag false and say why in context. A review is never skipped silently.";
