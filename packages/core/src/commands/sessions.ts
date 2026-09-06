import type { AgentId, Session, SessionId, SessionState, TaskId, Usage } from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import type { CommandContext, CommandResult } from "./context.ts";

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
};

export const isSessionActive = (state: SessionState): boolean =>
  state !== "stopped" && state !== "failed";

/** Opens a session for an assigned task and moves the task to `in_progress` in the same batch. */
export function startSession(
  model: ReadModel,
  input: { taskId: TaskId; agentId: AgentId },
  ctx: CommandContext,
): CommandResult<Session> {
  const task = model.tasks.get(input.taskId);
  if (task === undefined) {
    return err(notFound("task", input.taskId));
  }
  if (!model.agents.has(input.agentId)) {
    return err(notFound("agent", input.agentId));
  }
  if (task.assigneeId !== input.agentId || task.status !== "assigned") {
    return err(
      conflict(
        `task is ${task.status}${task.assigneeId === undefined ? " and unassigned" : ""}; only assigned tasks start sessions`,
      ),
    );
  }
  if ([...model.sessions.values()].some((s) => s.taskId === task.id && isSessionActive(s.state))) {
    return err(conflict("task already has an active session"));
  }
  const session: Session = {
    id: ctx.ids.session(),
    taskId: task.id,
    agentId: input.agentId,
    state: "starting",
    usage: ZERO_USAGE,
    startedAt: ctx.now,
  };
  return ok({
    events: [
      { type: "session.started", actor: ctx.actor, payload: { session } },
      {
        type: "task.status_changed",
        actor: ctx.actor,
        payload: { taskId: task.id, from: "assigned", to: "in_progress" },
      },
    ],
    value: session,
  });
}

export function changeSessionState(
  model: ReadModel,
  input: {
    sessionId: SessionId;
    state: SessionState;
    runtimeSessionId?: string;
    sandboxId?: string;
    reason?: string;
  },
  ctx: CommandContext,
): CommandResult<Session> {
  const session = model.sessions.get(input.sessionId);
  if (session === undefined) {
    return err(notFound("session", input.sessionId));
  }
  const { sessionId, ...rest } = input;
  const next: Session = {
    ...session,
    state: rest.state,
    ...(rest.runtimeSessionId === undefined ? {} : { runtimeSessionId: rest.runtimeSessionId }),
    ...(rest.sandboxId === undefined ? {} : { sandboxId: rest.sandboxId }),
  };
  return ok({
    events: [{ type: "session.state_changed", actor: ctx.actor, payload: { sessionId, ...rest } }],
    value: next,
  });
}

export function recordSessionUsage(
  model: ReadModel,
  input: { sessionId: SessionId; usage: Usage },
  ctx: CommandContext,
): CommandResult<Session> {
  const session = model.sessions.get(input.sessionId);
  if (session === undefined) {
    return err(notFound("session", input.sessionId));
  }
  return ok({
    events: [{ type: "session.usage_recorded", actor: ctx.actor, payload: input }],
    value: session,
  });
}

export function endSession(
  model: ReadModel,
  input: { sessionId: SessionId; state: "stopped" | "failed"; reason?: string },
  ctx: CommandContext,
): CommandResult<Session> {
  const session = model.sessions.get(input.sessionId);
  if (session === undefined) {
    return err(notFound("session", input.sessionId));
  }
  const next: Session = { ...session, state: input.state, endedAt: ctx.now };
  return ok({
    events: [{ type: "session.ended", actor: ctx.actor, payload: { ...input, endedAt: ctx.now } }],
    value: next,
  });
}
