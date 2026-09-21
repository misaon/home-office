import { changeSessionState, rateLimitedReason, recordSessionUsage } from "@ho/core";
import { budgetGuaranteesFor, clip, compact, type RuntimeEvent, SYSTEM_ACTOR } from "@ho/protocol";
import { idsOf, traceFor } from "./session-ids.ts";
import type { SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { idleWaitSeconds, masksExitCode } from "./waste.ts";

const TRACE_MAX = 300;

const shorten = (value: unknown): string =>
  value === undefined
    ? ""
    : clip(typeof value === "string" ? value : JSON.stringify(value), TRACE_MAX);

const MISSING = [
  /(?<tool>[\w./-]+): (?:command )?not found/iu,
  /command not found: (?<tool>[\w./-]+)/iu,
  /(?<tool>[\w./-]+): unrecognized option/iu,
  /unknown (?:command|option) ["']?(?<tool>[\w./-]+)/iu,
];

const gapOf = (event: RuntimeEvent): { tool: string; detail: string } | null => {
  if (event.kind !== "tool_result" || event.ok) {
    return null;
  }
  for (const pattern of MISSING) {
    const found = pattern.exec(event.summary);
    if (found !== null) {
      return { tool: found.groups?.["tool"] ?? "", detail: found[0].slice(0, 200) };
    }
  }
  return null;
};

const traceOf = (event: RuntimeEvent): Record<string, unknown> | null => {
  switch (event.kind) {
    case "text_delta": {
      return null;
    }
    case "init": {
      return {
        model: event.model,
        runtimeSessionId: event.runtimeSessionId,
        tools: event.tools,
        mcpServers: event.mcpServers,
        plugins: event.plugins,
        pluginErrors: event.pluginErrors,
      };
    }
    case "tool_call": {
      return { id: event.id, tool: event.name, input: shorten(event.input) };
    }
    case "tool_result": {
      return { id: event.id, ok: event.ok, summary: shorten(event.summary) };
    }
    case "permission_request": {
      return { id: event.id, tool: event.tool, input: shorten(event.input) };
    }
    case "file_change": {
      return {
        id: event.id,
        path: event.path,
        beforeChars: event.before?.length ?? null,
        afterChars: event.after.length,
        truncated: event.truncated,
      };
    }
    case "usage": {
      return {
        ...event.usage,
        ...compact({
          costUsd: event.costUsd,
          costBasis: event.costBasis,
          ttftMs: event.ttftMs,
          wallMs: event.wallMs,
        }),
      };
    }
    case "background_done": {
      return {
        id: event.id,
        status: event.status,
        exitCode: event.exitCode,
        summary: shorten(event.summary),
      };
    }
    case "plan_window": {
      return null;
    }
    case "context": {
      return {
        usedTokens: event.usedTokens,
        windowTokens: event.windowTokens,
        fill:
          event.windowTokens === 0
            ? null
            : Math.round((event.usedTokens / event.windowTokens) * 100),
        cost: event.cost,
      };
    }
    case "rate_limited": {
      return { retryAt: event.retryAt };
    }
    case "result": {
      return {
        ok: event.ok,
        turns: event.turns,
        runtimeSessionId: event.runtimeSessionId,
        text: shorten(event.text),
      };
    }
    case "error": {
      return { code: event.code, message: shorten(event.message) };
    }
  }
  return null;
};

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
    office.execute(
      SYSTEM_ACTOR,
      (m, c) => changeSessionState(m, { sessionId: ctx.session.id, state: next, ...extra }, c),
      traceFor(ctx),
    );
  deps.traces.observe(ctx.session.id, event);
  const reason = overBudget(ctx, spent, event);
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
