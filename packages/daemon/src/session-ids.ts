import type { EventTrace } from "@ho/core";
import type { SessionContext } from "./session-provision.ts";

export const traceFor = (ctx: Pick<SessionContext, "session" | "task">): EventTrace => ({
  correlationId: ctx.task.mandateId,
  causationId: ctx.session.id,
});

export const idsOf = (
  ctx: Pick<SessionContext, "session" | "task" | "agent">,
): Record<string, unknown> => ({
  sessionId: ctx.session.id,
  taskId: ctx.task.id,
  mandateId: ctx.task.mandateId ?? null,
  agent: ctx.agent.name,
});
