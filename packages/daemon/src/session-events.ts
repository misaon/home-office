import { changeSessionState, rateLimitedReason, recordSessionUsage } from "@ho/core";
import { budgetGuaranteesFor, compact, type RuntimeEvent, SYSTEM_ACTOR } from "@ho/protocol";
import type { SessionContext } from "./session-provision.ts";
import { gapOf, traceOf } from "./session-trace.ts";
import type { SessionDeps } from "./sessions.ts";

export type Spent = { toolCalls: number; costUsd: number | null };

const overBudget = (ctx: SessionContext, spent: Spent, event: RuntimeEvent): string | null => {
  const guarantees = budgetGuaranteesFor(ctx.agent.provider, ctx.agent.auth);
  if (event.kind === "tool_call") {
    spent.toolCalls += 1;
    return guarantees.turns === "office" && spent.toolCalls > ctx.budget.turns
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
    deps.log.warn(
      { sessionId: ctx.session.id, taskId: ctx.task.id, agent: ctx.agent.name, ...gap },
      "the sandbox lacks a tool the agent reached for",
    );
  }
  const trace = traceOf(event);
  if (trace !== null) {
    deps.log.debug(
      { sessionId: ctx.session.id, taskId: ctx.task.id, agent: ctx.agent.name, ...trace },
      `agent ${event.kind}`,
    );
  }
};

export async function handleRuntimeEvent(
  deps: SessionDeps,
  ctx: SessionContext,
  event: RuntimeEvent,
  spent: Spent,
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
    office.execute(SYSTEM_ACTOR, (m, c) =>
      changeSessionState(m, { sessionId: ctx.session.id, state: next, ...extra }, c),
    );
  deps.traces.observe(ctx.session.id, event);
  const reason = overBudget(ctx, spent, event);
  describeEvent(deps, ctx, event);
  if (event.kind === "usage") {
    await office.execute(SYSTEM_ACTOR, (m, c) =>
      recordSessionUsage(
        m,
        { sessionId: ctx.session.id, usage: event.usage, ...compact({ costUsd: event.costUsd }) },
        c,
      ),
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
      confirmed: { model: event.model, ...compact({ effort: event.effort }) },
    });
  } else if (
    (event.kind === "text_delta" || event.kind === "tool_call") &&
    office.model.sessions.get(ctx.session.id)?.state === "idle"
  ) {
    await state("running");
  }
  return reason;
}
