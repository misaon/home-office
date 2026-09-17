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
} from "./session-provision.ts";
import { skillPackFor } from "./skill-pack.ts";
import { explainExit } from "./session-record.ts";
import { settle } from "./session-settle.ts";
import type { SessionDeps } from "./sessions.ts";
import { elapsedMs } from "./timing.ts";

const PLUGINS_ROOT = "/opt/ho/plugins";
const HASH_CHARS = 12;

export type Outcome = { report: string; failure: string | null };

type Consumed = Outcome & {
  sawInit: boolean;
  failureCode: RuntimeErrorCode | null;
  turns: number;
};

type Prepared = { appendix: string; message: string; browser: boolean; pack: string };

const hashOf = (text: string): string =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, HASH_CHARS);

const browserFor = (deps: SessionDeps, ctx: SessionContext): boolean =>
  deps.config.browser.enabled && (ctx.session.mode === "triage" || ctx.task.browser === true);

const prepare = (deps: SessionDeps, ctx: SessionContext, provisioned: Provisioned): Prepared => {
  const browser = browserFor(deps, ctx);
  return {
    browser,
    pack: skillPackFor(ctx.agent, ctx.session.mode),
    appendix: systemPrompt(
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
    message: openingMessage(ctx.task, ctx.session.mode, ctx.previous),
  };
};

const openRuntime = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  prepared: Prepared,
  secrets: Readonly<Record<string, string>>,
  resume: string | null,
): Promise<RuntimeSession> => {
  const mcpServers = {
    ho: {
      kind: "http" as const,
      url: deps.mcpUrl(),
      headers: { Authorization: `Bearer ${provisioned.mcpToken}` },
    },
    ...(prepared.browser && ctx.session.mode !== "triage"
      ? browserMcpServers(deps.config.browser.devtools)
      : {}),
  };
  const spec = {
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
    systemPromptAppendix: prepared.appendix,
    cwd: REPO_IN_VOLUME,
    resume,
    pluginDirs: prepared.pack === "none" ? [] : [`${PLUGINS_ROOT}/${prepared.pack}`],
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
    resume,
    promptHash: hashOf(prepared.appendix),
    promptChars: prepared.appendix.length,
    openingChars: prepared.message.length,
  };
  deps.log.debug(
    { sessionId: ctx.session.id, taskId: ctx.task.id, ...runtime },
    "opening the runtime",
  );
  deps.traces.write(ctx.session.id, { kind: "runtime", ...runtime }, true);
  return deps.runtimes[ctx.agent.provider].open(spec, provisioned.connection.channel, secrets);
};

async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  message: string,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Consumed> {
  const outcome: Consumed = {
    report: "",
    failure: null,
    failureCode: null,
    sawInit: false,
    turns: 0,
  };
  let sawResult = false;
  for await (const event of runtimeSession.prompt({ text: message }, ctx.signal)) {
    await onEvent(event);
    if (event.kind === "init") {
      outcome.sawInit = true;
    } else if (event.kind === "result") {
      sawResult = true;
      outcome.turns = event.turns;
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
  const prepared = prepare(deps, ctx, provisioned);
  const resume = ctx.previous?.runtimeSessionId ?? null;
  deps.traces.write(ctx.session.id, {
    kind: "prompt",
    prompt: prepared.appendix,
    opening: prepared.message,
  });
  const started = Bun.nanoseconds();
  try {
    const first = await openRuntime(deps, ctx, provisioned, prepared, secrets, resume);
    let outcome: Consumed;
    try {
      outcome = await consume(first, ctx, prepared.message, onEvent);
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
      const fresh = await openRuntime(deps, ctx, provisioned, prepared, secrets, null);
      try {
        outcome = await consume(
          fresh,
          ctx,
          `${prepared.message}\n\n(Your earlier conversation could not be restored; the notes above are the full context.)`,
          onEvent,
        );
      } finally {
        fresh.close();
      }
    }
    const ms = elapsedMs(started);
    deps.log.info(
      {
        sessionId: ctx.session.id,
        taskId: ctx.task.id,
        mode: ctx.session.mode,
        ms,
        turns: outcome.turns,
        failure: outcome.failure,
        code: outcome.failureCode,
      },
      "runtime finished",
    );
    deps.traces.write(
      ctx.session.id,
      {
        kind: "prompt_finished",
        ms,
        turns: outcome.turns,
        failure: outcome.failure,
        code: outcome.failureCode,
      },
      true,
    );
    if (outcome.failureCode === "process_exit") {
      await explainExit(deps, ctx, provisioned, outcome.failure);
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
