import { changeSessionState, type RuntimeSession } from "@ho/core";
import {
  compact,
  REPORT_MAX,
  type RuntimeErrorCode,
  type RuntimeEvent,
  type SessionRuntime,
  type SessionServices,
  type SessionState,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { secretEnvFor } from "./provider-secrets.ts";
import {
  provision,
  type Provisioned,
  type SessionContext,
  sessionServicesOf,
} from "./session-provision.ts";
import { explainExit } from "./session-record.ts";
import { openRuntime, prepare, type Prepared } from "./session-runtime.ts";
import { settle } from "./session-settle.ts";
import type { SessionDeps } from "./sessions.ts";
import { elapsedMs } from "./timing.ts";

export type Outcome = { report: string; failure: string | null };

type Consumed = Outcome & {
  sawInit: boolean;
  failureCode: RuntimeErrorCode | null;
  turns: number;
};

const abortReason = (signal: AbortSignal): string => {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason.message : "session aborted (time budget or shutdown)";
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
    outcome.failure = abortReason(ctx.signal);
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
  prepared: Prepared,
  secrets: Readonly<Record<string, string>>,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
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
  extra: { sandboxId?: string; services?: SessionServices; runtime?: SessionRuntime } = {},
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
  deps.traces.protect(ctx.session.id, Object.values(secretEnv));
  const provisioned = await provision(deps, ctx);
  hold(provisioned);
  deps.traces.protect(ctx.session.id, [provisioned.mcpToken]);
  const prepared = prepare(deps, ctx, provisioned);
  await setState(deps, ctx, "starting", {
    sandboxId: provisioned.sandbox.id,
    runtime: prepared.runtime,
    ...compact({ services: sessionServicesOf(provisioned.services) }),
  });
  deps.log.info(
    {
      sessionId: ctx.session.id,
      mode: ctx.session.mode,
      resume: ctx.previous?.runtimeSessionId ?? null,
      uid: provisioned.connection.uid,
      budget: ctx.budget,
    },
    "runner connected",
  );
  const outcome = await runPrompt(deps, ctx, provisioned, prepared, secretEnv, onEvent);
  await setState(deps, ctx, "stopping");
  await settle(deps, ctx, provisioned, outcome);
  return {
    state: outcome.failure === null ? "stopped" : "failed",
    reason: outcome.failure ?? undefined,
  };
}
