import {
  attachmentsOfTask,
  escalatedEffort,
  shapedEffort,
  wallMinutesFor,
  type RuntimeSession,
  setbacksOf,
} from "@ho/core";
import { compact, imageRefFor, PROVIDERS, type SessionRuntime } from "@ho/protocol";
import { browserMcpServers } from "./browser.ts";
import type { EnvironmentReport } from "./environment-report.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { openingMessage, systemPrompt } from "./prompts.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { lspPluginsFor, skillPacksFor } from "./skill-pack.ts";

const PLUGINS_ROOT = "/opt/ho/plugins";
const LSP_ROOT = "/opt/ho/lsp";
const HASH_CHARS = 12;

export type Prepared = {
  appendix: string;
  message: string;
  browser: boolean;
  packs: string[];
  lsp: string[];
  runtime: SessionRuntime;
};

const hashOf = (text: string): string =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, HASH_CHARS);

const plans = (ctx: SessionContext): boolean =>
  ctx.session.mode === "triage" || ctx.session.mode === "plan";

const browserFor = (deps: SessionDeps, ctx: SessionContext): boolean =>
  deps.config.browser.enabled && (plans(ctx) || ctx.task.browser === true);

const setbacksFor = (ctx: SessionContext): number =>
  ctx.session.mode === "work" ? setbacksOf(ctx.task) : 0;

export const prepare = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  environment: EnvironmentReport | null,
): Prepared => {
  const browser = browserFor(deps, ctx);
  const packs = skillPacksFor(ctx.agent, ctx.session.mode);
  const lsp = lspPluginsFor(ctx.agent.provider, provisioned.languages);
  const appendix = systemPrompt(
    {
      agent: ctx.agent,
      project: ctx.project,
      task: ctx.task,
      files: attachmentsOfTask(deps.office.model, ctx.task),
      mode: ctx.session.mode,
      branch: provisioned.branch,
      commit: provisioned.commit,
      base: provisioned.base,
      diff: provisioned.diff,
      languages: provisioned.languages,
      browser,
      preview: ctx.project.preview,
      services: provisioned.services,
      environment,
      network: deps.config.docker.network === "none" ? "none" : "bridge",
      budget: { turns: ctx.budget.turns, wallMinutes: wallMinutesFor(ctx.agent, ctx.task) },
    },
    deps.office.model,
  );
  return {
    browser,
    packs,
    lsp,
    appendix,
    message: openingMessage(ctx.task, ctx.session.mode, ctx.previous, ctx.agent.id),
    runtime: {
      model: ctx.agent.model,
      effort: escalatedEffort(
        shapedEffort(
          ctx.agent.effort,
          PROVIDERS[ctx.agent.provider].effortLevels,
          ctx.task.shape,
          ctx.session.mode,
        ),
        PROVIDERS[ctx.agent.provider].effortLevels,
        setbacksFor(ctx),
      ),
      promptHash: hashOf(appendix),
      skillPacks: packs,
      image: imageRefFor(deps.config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
      ...compact({ imageDigest: provisioned.imageId ?? undefined }),
    },
  };
};

export const openRuntime = async (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  prepared: Prepared,
  secrets: Readonly<Record<string, string>>,
  resume: string | null,
  turns: number | null = null,
): Promise<RuntimeSession> => {
  const mcpServers = {
    ho: {
      kind: "http" as const,
      url: deps.mcpUrl(),
      headers: { Authorization: `Bearer ${provisioned.mcpToken}` },
    },
    ...(prepared.browser && !plans(ctx) ? browserMcpServers(deps.config.browser.devtools) : {}),
  };
  const spec = {
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    agentId: ctx.agent.id,
    provider: ctx.agent.provider,
    auth: ctx.agent.auth,
    model: prepared.runtime.model,
    effort: prepared.runtime.effort,
    maxTurns: Math.max(1, turns ?? ctx.budget.turns),
    maxUsd: ctx.budget.usd,
    allowWrites: ctx.session.mode === "work",
    systemPromptAppendix: prepared.appendix,
    cwd: REPO_IN_VOLUME,
    resume,
    pluginDirs: [
      ...prepared.packs.map((pack) => `${PLUGINS_ROOT}/${pack}`),
      ...prepared.lsp.map((language) => `${LSP_ROOT}/${language}`),
    ],
    mcpServers,
  };
  const runtime = {
    provider: spec.provider,
    model: spec.model,
    effort: spec.effort,
    maxTurns: spec.maxTurns,
    maxUsd: spec.maxUsd,
    allowWrites: spec.allowWrites,
    pluginDirs: spec.pluginDirs,
    mcpServers: Object.keys(mcpServers),
    browser: prepared.browser,
    setbacks: setbacksFor(ctx),
    askedFor: ctx.agent.effort,
    resume,
    promptHash: prepared.runtime.promptHash,
    promptChars: prepared.appendix.length,
    openingChars: prepared.message.length,
    image: prepared.runtime.image,
    imageDigest: provisioned.imageId,
    skillPackVersions: await deps.mcp.skillVersions(prepared.packs),
    environmentHash: hashOf(JSON.stringify(ctx.project.environment)),
  };
  deps.log.debug(
    { sessionId: ctx.session.id, taskId: ctx.task.id, ...runtime },
    "opening the runtime",
  );
  deps.traces.write(ctx.session.id, { kind: "runtime", ...runtime }, true);
  return deps.runtimes[ctx.agent.provider].open(spec, provisioned.connection.channel, secrets);
};
