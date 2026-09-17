import { attachmentsOfTask, changeSessionState, type RuntimeSession } from "@ho/core";
import {
  compact,
  REPORT_MAX,
  type RuntimeErrorCode,
  type RuntimeEvent,
  type SessionState,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { browserMcpServers } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { openingMessage, systemPrompt } from "./prompts.ts";
import { secretEnvFor } from "./provider-secrets.ts";
import {
  provision,
  type Provisioned,
  type SessionContext,
  sessionServicesOf,
  skillPackFor,
} from "./session-provision.ts";
import { settle } from "./session-settle.ts";
import type { SessionDeps } from "./sessions.ts";

const PLUGINS_ROOT = "/opt/ho/plugins";

export type Outcome = { report: string; failure: string | null };

const browserFor = (deps: SessionDeps, ctx: SessionContext): boolean =>
  deps.config.browser.enabled && (ctx.session.mode === "triage" || ctx.task.browser === true);

const openRuntime = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  resume: string | null,
): Promise<RuntimeSession> => {
  const browser = browserFor(deps, ctx);
  const pack = skillPackFor(ctx);
  return deps.runtimes[ctx.agent.provider].open(
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
      allowWrites: ctx.session.mode === "work",
      systemPromptAppendix: systemPrompt(
        {
          agent: ctx.agent,
          project: ctx.project,
          task: ctx.task,
          files: attachmentsOfTask(deps.office.model, ctx.task),
          mode: ctx.session.mode,
          branch: provisioned.branch,
          browser,
          preview: ctx.project.preview,
          services: provisioned.services,
        },
        deps.office.model,
      ),
      cwd: REPO_IN_VOLUME,
      resume,
      pluginDirs: pack === "none" ? [] : [`${PLUGINS_ROOT}/${pack}`],
      mcpServers: {
        ho: {
          kind: "http",
          url: deps.mcpUrl(),
          headers: { Authorization: `Bearer ${provisioned.mcpToken}` },
        },
        ...(browser && ctx.session.mode !== "triage"
          ? browserMcpServers(deps.config.browser.devtools)
          : {}),
      },
    },
    provisioned.connection.channel,
    secrets,
  );
};

async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  message: string,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome & { sawInit: boolean; failureCode: RuntimeErrorCode | null }> {
  const outcome = {
    report: "",
    failure: null as string | null,
    failureCode: null as RuntimeErrorCode | null,
    sawInit: false,
  };
  let sawResult = false;
  for await (const event of runtimeSession.prompt({ text: message }, ctx.signal)) {
    await onEvent(event);
    if (event.kind === "init") {
      outcome.sawInit = true;
    } else if (event.kind === "result") {
      sawResult = true;
      outcome.report = event.text.slice(0, REPORT_MAX);
      if (!event.ok && outcome.failure === null) {
        const reported = event.text.trim();
        outcome.failure = reported === "" ? "the agent reported an error" : reported.slice(0, 1000);
      }
    } else if (event.kind === "error") {
      outcome.failure = `${event.code}: ${event.message}`;
      outcome.failureCode = event.code;
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

async function runPrompt(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const message = openingMessage(ctx.task, ctx.session.mode, ctx.previous);
  const resume = ctx.previous?.runtimeSessionId ?? null;
  deps.log.debug(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      mode: ctx.session.mode,
      threadId: ctx.session.threadId ?? null,
      resume,
      previousSessionId: ctx.previous?.id ?? null,
      previousTaskId: ctx.previous?.taskId ?? null,
    },
    "opening the runtime",
  );
  try {
    const first = await openRuntime(deps, ctx, provisioned, secrets, resume);
    let outcome: Outcome & { sawInit: boolean; failureCode: RuntimeErrorCode | null };
    try {
      outcome = await consume(first, ctx, message, onEvent);
    } finally {
      first.close();
    }
    if (resume !== null && !outcome.sawInit && outcome.failure !== null && !ctx.signal.aborted) {
      deps.log.warn(
        {
          sessionId: ctx.session.id,
          resume,
          code: outcome.failureCode,
          failure: outcome.failure.slice(0, 300),
        },
        "resume failed; starting a fresh conversation",
      );
      const fresh = await openRuntime(deps, ctx, provisioned, secrets, null);
      try {
        outcome = await consume(
          fresh,
          ctx,
          `${message}\n\n(Your earlier conversation could not be restored; the notes above are the full context.)`,
          onEvent,
        );
      } finally {
        fresh.close();
      }
    }
    return { report: outcome.report, failure: outcome.failure };
  } finally {
    await provisioned.connection.terminate();
  }
}

export type Ending = { state: "stopped" | "failed"; reason: string | undefined };

const setState = (
  deps: SessionDeps,
  ctx: SessionContext,
  state: SessionState,
  extra: { sandboxId?: string; services?: "ready" | "failed" } = {},
): Promise<unknown> =>
  deps.office.execute(SYSTEM_ACTOR, (m, c) =>
    changeSessionState(m, { sessionId: ctx.session.id, state, ...extra }, c),
  );

export async function runSession(
  deps: SessionDeps,
  ctx: SessionContext,
  hold: (provisioned: Provisioned) => void,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Ending> {
  const secretEnv = await secretEnvFor(deps.secrets, ctx.agent);
  const provisioned = await provision(deps, ctx);
  hold(provisioned);
  await setState(deps, ctx, "starting", {
    sandboxId: provisioned.sandbox.id,
    ...compact({ services: sessionServicesOf(provisioned.services) }),
  });
  deps.log.info(
    {
      sessionId: ctx.session.id,
      mode: ctx.session.mode,
      resume: ctx.previous?.runtimeSessionId ?? null,
      uid: provisioned.connection.uid,
    },
    "runner connected",
  );
  const outcome = await runPrompt(deps, ctx, provisioned, secretEnv, onEvent);
  await setState(deps, ctx, "stopping");
  await settle(deps, ctx, provisioned, outcome);
  return {
    state: outcome.failure === null ? "stopped" : "failed",
    reason: outcome.failure ?? undefined,
  };
}
