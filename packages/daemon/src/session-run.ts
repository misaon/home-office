import type { RuntimeEvent, RuntimeSession } from "@ho/core";
import type { TaskArtifacts } from "@ho/protocol";
import { browserMcpServers } from "./browser.ts";
import { pushFromVolume, REPO_IN_VOLUME } from "./git-bridge.ts";
import {
  openingMessage,
  reviewPrompt,
  type ServicesState,
  triagePrompt,
  workPrompt,
} from "./prompts.ts";
import { deliver } from "./publish.ts";
import { type Provisioned, sessionServicesOf, type SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";

const REPORT_MAX = 4000;
const PLUGINS_ROOT = "/opt/ho/plugins";

export type Outcome = {
  report: string;
  failure: string | null;
  runtimeSessionId: string | null;
  sawInit: boolean;
};

const servicesStateOf = (provisioned: Provisioned): ServicesState => {
  const services = sessionServicesOf(provisioned);
  if (services === "ready") {
    return { kind: "ready" };
  }
  if (services === "failed") {
    return { kind: "failed", message: provisioned.engineFailure ?? "unknown reason" };
  }
  return { kind: "off" };
};

const promptFor = (deps: SessionDeps, ctx: SessionContext, provisioned: Provisioned): string => {
  const { branch } = provisioned;
  const browser = deps.config.browser.enabled;
  if (ctx.session.mode === "review") {
    return reviewPrompt(
      ctx.agent,
      ctx.project,
      ctx.task,
      branch,
      browser,
      servicesStateOf(provisioned),
    );
  }
  if (ctx.session.mode === "triage") {
    return triagePrompt(ctx.agent, ctx.project, deps.office.model);
  }
  return workPrompt(
    ctx.agent,
    ctx.project,
    ctx.task,
    branch,
    browser,
    servicesStateOf(provisioned),
  );
};

const openRuntime = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  resume: string | null,
): Promise<RuntimeSession> =>
  deps.runtimes[ctx.agent.provider].open(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      agentId: ctx.agent.id,
      provider: ctx.agent.provider,
      auth: ctx.agent.auth,
      model: ctx.agent.model,
      effort: ctx.agent.effort,
      maxTurns: ctx.agent.budgets.maxTurnsPerTask,
      maxUsd: ctx.agent.budgets.maxUsdPerTask ?? null,
      systemPromptAppendix: promptFor(deps, ctx, provisioned),
      cwd: REPO_IN_VOLUME,
      resume,
      pluginDirs: ctx.agent.skillPack === "none" ? [] : [`${PLUGINS_ROOT}/${ctx.agent.skillPack}`],
      mcpServers: {
        ho: {
          kind: "http",
          url: deps.mcpUrl,
          headers: { Authorization: `Bearer ${provisioned.mcpToken}` },
        },
        ...(deps.config.browser.enabled && ctx.session.mode !== "triage"
          ? browserMcpServers(deps.config.browser.devtools)
          : {}),
      },
    },
    provisioned.connection.channel,
    secrets,
  );

/** Drives one prompt to its result, forwarding every event to `onEvent` (live fan-out + persistence). */
async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  message: string,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const outcome: Outcome = { report: "", failure: null, runtimeSessionId: null, sawInit: false };
  let sawResult = false;
  for await (const event of runtimeSession.prompt({ text: message }, ctx.signal)) {
    await onEvent(event);
    switch (event.kind) {
      case "init": {
        outcome.sawInit = true;
        outcome.runtimeSessionId = event.runtimeSessionId;
        break;
      }
      case "result": {
        sawResult = true;
        outcome.report = event.text.slice(0, REPORT_MAX);
        outcome.runtimeSessionId = event.runtimeSessionId ?? outcome.runtimeSessionId;
        if (!event.ok && outcome.failure === null) {
          outcome.failure = "the agent reported an error";
        }
        break;
      }
      case "error": {
        outcome.failure = `${event.code}: ${event.message}`;
        break;
      }
      case "usage":
      case "context":
      case "rate_limited":
      case "text_delta":
      case "tool_call":
      case "tool_result":
      case "permission_request": {
        break;
      }
    }
  }
  if (ctx.signal.aborted && outcome.failure === null) {
    outcome.failure = "session aborted (time budget or shutdown)";
  }
  if (!sawResult && outcome.failure === null) {
    outcome.failure = "runtime ended without a result";
  }
  return outcome;
}

/**
 * Runs the session's single prompt, resuming the agent's earlier conversation when one exists. A resume that
 * dies before `init` (the conversation is gone) is retried once as a fresh conversation.
 */
export async function runPrompt(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const message = openingMessage(ctx.task, ctx.session.mode, ctx.previous);
  const resume = ctx.previous?.runtimeSessionId ?? null;
  let runtimeSession = await openRuntime(deps, ctx, provisioned, secrets, resume);
  try {
    let outcome = await consume(runtimeSession, ctx, message, onEvent);
    if (
      resume !== null &&
      !outcome.sawInit &&
      outcome.failure?.startsWith("process_exit") === true &&
      !ctx.signal.aborted
    ) {
      deps.log.warn(
        { sessionId: ctx.session.id, resume },
        "resume failed; starting a fresh conversation",
      );
      await runtimeSession.close().catch(() => null);
      runtimeSession = await openRuntime(deps, ctx, provisioned, secrets, null);
      outcome = await consume(
        runtimeSession,
        ctx,
        `${message}\n\n(Your earlier conversation could not be restored; the notes above are the full context.)`,
        onEvent,
      );
    }
    return outcome;
  } finally {
    await runtimeSession.close().catch(() => null);
  }
}

/** Pushes the branch back to the source repository, then (per project policy) opens a pull request. */
export async function publish(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  report: string,
): Promise<TaskArtifacts> {
  await pushFromVolume(
    deps.provider,
    deps.config,
    provisioned.sourcePath,
    provisioned.volume,
    provisioned.branch,
  );
  return deliver(deps.home, ctx.project, ctx.task, provisioned.branch, report);
}
