import { changeSessionState, rateLimitedReason, recordSessionUsage } from "@ho/core";
import { budgetGuaranteesFor, compact, type RuntimeEvent, SYSTEM_ACTOR } from "@ho/protocol";
import { idsOf, traceFor } from "./session-ids.ts";
import { GRACE_TURNS } from "./session-run.ts";
import type { SessionContext } from "./session-provision.ts";
import { type Reminder, turnReminder } from "./session-reminders.ts";
import { gapOf, shorten, traceOf } from "./session-trace.ts";
import type { SessionDeps } from "./sessions.ts";
import { idleWaitSeconds, masksExitCode } from "./waste.ts";

export type Spent = {
  toolCalls: number;
  costUsd: number | null;
  overheadWarned: boolean;
  reminders: Set<Reminder>;
};

export const freshSpent = (): Spent => ({
  toolCalls: 0,
  costUsd: null,
  overheadWarned: false,
  reminders: new Set(),
});

export type SessionChannel = {
  send: (text: string) => boolean;
  emit: (event: RuntimeEvent) => void;
  wallMinutes: number;
};

const OVERHEAD_SHARE = 0.75;

const overBudget = (
  deps: SessionDeps,
  ctx: SessionContext,
  spent: Spent,
  event: RuntimeEvent,
): string | null => {
  const guarantees = budgetGuaranteesFor(ctx.agent.provider, ctx.agent.auth);
  if (event.kind === "tool_call") {
    spent.toolCalls += 1;
    if (!spent.overheadWarned && spent.toolCalls > Math.ceil(ctx.budget.turns * OVERHEAD_SHARE)) {
      spent.overheadWarned = true;
      deps.log.warn(
        { ...idsOf(ctx), shape: ctx.task.shape, used: spent.toolCalls, allowed: ctx.budget.turns },
        "the session is past three quarters of the turns its shape allows",
      );
    }
    const allowed = ctx.budget.turns + (ctx.session.mode === "work" ? 0 : GRACE_TURNS);
    return guarantees.turns === "office" && spent.toolCalls > allowed
      ? `turn budget exhausted: ${String(spent.toolCalls)} tool calls against ${String(ctx.budget.turns)} allowed for this task`
      : null;
  }
  const cost =
    event.kind === "context" && event.cost?.currency === "USD"
      ? event.cost.amount
      : event.kind === "usage"
        ? event.costUsd
        : undefined;
  if (cost === undefined) {
    return null;
  }
  spent.costUsd = cost;
  return guarantees.usd === "office" && ctx.budget.usd !== null && cost >= ctx.budget.usd
    ? `spend budget exhausted: $${cost.toFixed(2)} reported against $${ctx.budget.usd.toFixed(2)} left for this task`
    : null;
};

const describeEvent = (deps: SessionDeps, ctx: SessionContext, event: RuntimeEvent): void => {
  const gap = gapOf(event);
  if (gap !== null) {
    deps.log.warn({ ...idsOf(ctx), ...gap }, "the sandbox lacks a tool the agent reached for");
  }
  if (event.kind === "tool_call") {
    const seconds = idleWaitSeconds(event.name, event.input);
    if (seconds > 0) {
      deps.log.warn(
        { ...idsOf(ctx), seconds, command: shorten(event.input) },
        "the agent waits idle with sleep instead of watching the process",
      );
    }
    if (masksExitCode(event.name, event.input)) {
      deps.log.warn(
        { ...idsOf(ctx), command: shorten(event.input) },
        "a check runs behind a pipe that hides its exit code",
      );
    }
  }
  const trace = traceOf(event);
  if (trace !== null) {
    deps.log.debug({ ...idsOf(ctx), ...trace }, `agent ${event.kind}`);
  }
};

const remind = (
  deps: SessionDeps,
  ctx: SessionContext,
  event: RuntimeEvent,
  spent: Spent,
  channel: SessionChannel,
): void => {
  if (event.kind !== "tool_call") {
    return;
  }
  const text = turnReminder(
    ctx,
    spent.toolCalls,
    spent.reminders,
    deps.office.clock.now().getTime(),
    channel.wallMinutes,
  );
  if (text !== null && channel.send(text)) {
    channel.emit({ kind: "reminder", text });
    deps.log.info(
      { ...idsOf(ctx), toolCalls: spent.toolCalls, turns: ctx.budget.turns },
      "the office reminded the agent of its budget",
    );
  }
};

export async function handleRuntimeEvent(
  deps: SessionDeps,
  ctx: SessionContext,
  event: RuntimeEvent,
  spent: Spent,
  channel: SessionChannel,
): Promise<string | null> {
  const { office } = deps;
  const state = (
    next: "idle" | "running",
    extra: {
      runtimeSessionId?: string;
      confirmed?: { model?: string; effort?: string };
      reason?: string;
    } = {},
  ): Promise<unknown> =>
    office.execute(
      SYSTEM_ACTOR,
      (m, c) => changeSessionState(m, { sessionId: ctx.session.id, state: next, ...extra }, c),
      traceFor(ctx),
    );
  deps.traces.observe(ctx.session.id, event);
  const reason = overBudget(deps, ctx, spent, event);
  if (reason === null) {
    remind(deps, ctx, event, spent, channel);
  }
  describeEvent(deps, ctx, event);
  if (event.kind === "usage") {
    await office.execute(
      SYSTEM_ACTOR,
      (m, c) =>
        recordSessionUsage(
          m,
          {
            sessionId: ctx.session.id,
            usage: event.usage,
            ...compact({
              costUsd: event.costUsd,
              costBasis: event.costBasis,
              ttftMs: event.ttftMs,
            }),
          },
          c,
        ),
      traceFor(ctx),
    );
  } else if (event.kind === "rate_limited") {
    await state("idle", { reason: rateLimitedReason(event.retryAt) });
  } else if (event.kind === "init") {
    if (event.model !== ctx.agent.model) {
      deps.log.debug(
        { sessionId: ctx.session.id, requested: ctx.agent.model, confirmed: event.model },
        "the runtime reports a model id other than the configured one",
      );
    }
    await state("running", {
      runtimeSessionId: event.runtimeSessionId,
      confirmed: {
        model: event.model,
        ...compact({ effort: event.effort, version: event.version }),
      },
    });
  } else if (
    (event.kind === "text_delta" || event.kind === "tool_call") &&
    office.model.sessions.get(ctx.session.id)?.state === "idle"
  ) {
    await state("running");
  }
  return reason;
}
