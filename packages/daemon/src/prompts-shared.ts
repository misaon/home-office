import { membersOf, type ReadModel, sessionsOfAgent } from "@ho/core";
import {
  type Agent,
  type Attachment,
  CHAT_INBOX_DIR,
  isSessionActive,
  type Project,
  ROLE_TITLE,
  type Session,
  type Task,
} from "@ho/protocol";
import { BROWSER_OUTPUT_DIR } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";

export type Services = { kind: "off" } | { kind: "ready" } | { kind: "failed"; message: string };

type Preview = { enabled: boolean; port: number };

export type SessionFacts = {
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

export const SANDBOX =
  "Sandbox: only /work and /tmp are writable; the rest of the filesystem, including your home directory, is read-only. Package caches already point into /work/.cache and survive between your sessions on this task. The git remote is a path this sandbox cannot reach, so fetch, pull and push fail, and there is no gh; the office moves commits for you.";

export const repoRules = (agent: Agent): string =>
  agent.provider === "claude-code"
    ? "House rules: this repository's CLAUDE.md, .claude/rules and .claude/skills are loaded for you; follow them over your habits. If the repository has an AGENTS.md that CLAUDE.md does not import, read it first and treat it the same way."
    : "House rules: read the repository's CLAUDE.md and AGENTS.md at the root before you start, unless your runtime already loaded them, and follow them over your habits.";

export const browserGuide = (enabled: boolean): string =>
  enabled
    ? `Browser: headless Chromium with the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_take_screenshot and more); there is no display. Screenshots land in ${BROWSER_OUTPUT_DIR}; copy the ones that belong in the repository into the repository before committing. Close pages you no longer need.`
    : "";

export const serveGuide = (preview: Preview, browser: boolean): string => {
  if (preview.enabled) {
    const port = String(preview.port);
    return `Serving: bind a server you start to 0.0.0.0:${port}, not 127.0.0.1, or only you will see it; the human reaches it at http://127.0.0.1:${port}${browser ? ", and so do your browser tools" : ""}. That port is the only one that leaves the sandbox.`;
  }
  return browser
    ? "Serving: nothing you serve leaves this sandbox. Start dev servers on 127.0.0.1 and open them at http://127.0.0.1:<port> with your browser tools; send the human a screenshot rather than a local URL."
    : "Serving: nothing you serve leaves this sandbox, so never tell the human to open a local URL.";
};

export const servicesGuide = (services: Services): string => {
  if (services.kind === "off") {
    return "";
  }
  if (services.kind === "failed") {
    return `Services: this project expects a private container engine, but it did not start (${services.message}). Do not run docker or docker compose; if the task needs them, report that as the blocker.`;
  }
  return `Services: this task has its own Docker engine — \`docker\`, \`docker compose\` and \`docker buildx\` reach only it, never the host. Run the repository's own compose file from ${REPO_IN_VOLUME} as written; published ports answer on 127.0.0.1 inside this sandbox. Per-service limits such as mem_limit are accepted but not enforced: the engine has one memory limit for the whole environment, and passing it kills every service at once. Images, build cache and service volumes survive for the next session of this task.`;
};

export const filesGuide = (files: readonly Attachment[]): string =>
  files.length === 0
    ? ""
    : `Files from the human, read-only in ${CHAT_INBOX_DIR}: ${files.map((f) => f.name).join(", ")}.`;

export const criteriaGuide = (task: Task, lead: string): string =>
  task.spec === undefined
    ? ""
    : `${lead}\n${task.spec.acceptanceCriteria.map((c, i) => `${String(i + 1)}. ${c}`).join("\n")}`;

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
  "Set qa and security deliberately on every ho_delegate: qa true when a tester can exercise the result (user-visible behaviour, an API or data change), false for documentation, configuration and refactors the checks already cover; security true when the change touches authentication, authorisation, input handling, secrets, cryptography, network exposure, dependencies or a hot path where performance matters. The head of development reviews every task last; QA and the security engineer review only the tasks flagged for them, and a flagged role that is missing on this floor is skipped.";
