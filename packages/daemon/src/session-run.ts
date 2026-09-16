import { attachmentsOfTask, type RuntimeSession } from "@ho/core";
import type { RuntimeEvent } from "@ho/protocol";
import { browserMcpServers } from "./browser.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { openingMessage, systemPrompt } from "./prompts.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";

const REPORT_MAX = 4000;
const PLUGINS_ROOT = "/opt/ho/plugins";

export type Outcome = { report: string; failure: string | null };

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
      systemPromptAppendix: systemPrompt(
        {
          agent: ctx.agent,
          project: ctx.project,
          task: ctx.task,
          files: attachmentsOfTask(deps.office.model, ctx.task),
          mode: ctx.session.mode,
          branch: provisioned.branch,
          browser: deps.config.browser.enabled,
          services: provisioned.services,
        },
        deps.office.model,
      ),
      cwd: REPO_IN_VOLUME,
      resume,
      pluginDirs: ctx.agent.skillPack === "none" ? [] : [`${PLUGINS_ROOT}/${ctx.agent.skillPack}`],
      mcpServers: {
        ho: {
          kind: "http",
          url: deps.mcpUrl(),
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

async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  message: string,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome & { sawInit: boolean }> {
  const outcome = { report: "", failure: null as string | null, sawInit: false };
  let sawResult = false;
  for await (const event of runtimeSession.prompt({ text: message }, ctx.signal)) {
    await onEvent(event);
    if (event.kind === "init") {
      outcome.sawInit = true;
    } else if (event.kind === "result") {
      sawResult = true;
      outcome.report = event.text.slice(0, REPORT_MAX);
      if (!event.ok && outcome.failure === null) {
        outcome.failure = "the agent reported an error";
      }
    } else if (event.kind === "error") {
      outcome.failure = `${event.code}: ${event.message}`;
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

export async function runPrompt(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const message = openingMessage(ctx.task, ctx.session.mode, ctx.previous);
  const resume = ctx.previous?.runtimeSessionId ?? null;
  try {
    const first = await openRuntime(deps, ctx, provisioned, secrets, resume);
    let outcome: Outcome & { sawInit: boolean };
    try {
      outcome = await consume(first, ctx, message, onEvent);
    } finally {
      first.close();
    }
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
