import {
  type AgentId,
  compact,
  conflict,
  isSessionActive,
  MODE_OF_KIND,
  type NewEvent,
  notFound,
  type Session,
  type SessionId,
  type SessionMode,
  type SessionRuntime,
  type SessionServices,
  type SessionState,
  type TaskId,
  type Usage,
  ZERO_USAGE,
} from "@ho/protocol";
import {
  activeSessionOfTask,
  resumableSession,
  resumableThreadSession,
  sessionsOfAgent,
  threadOfTask,
} from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, entity, err, ok } from "../result.ts";
import { statusChange, withSession } from "./shared.ts";

const readSession =
  (id: SessionId) =>
  (model: ReadModel): Session =>
    entity(model.sessions, id);

export function startSession(
  model: ReadModel,
  input: { taskId: TaskId; agentId: AgentId; mode: SessionMode },
  ctx: CommandContext,
): CommandResult<Session> {
  const task = model.tasks.get(input.taskId);
  if (task === undefined) {
    return err(notFound("task", input.taskId));
  }
  const agent = model.agents.get(input.agentId);
  if (agent === undefined) {
    return err(notFound("agent", input.agentId));
  }
  if (agent.projectId !== task.projectId) {
    return err(conflict("agent belongs to another project"));
  }
  if (input.mode !== "review" && input.mode !== MODE_OF_KIND[task.kind]) {
    return err(conflict("session mode does not match the task kind"));
  }
  if (
    sessionsOfAgent(model, agent.id).filter((s) => isSessionActive(s.state)).length >=
    agent.budgets.maxConcurrentSessions
  ) {
    return err(conflict("agent session budget exhausted"));
  }
  if (input.mode === "review") {
    if (task.status !== "review" || task.reviewerId !== input.agentId) {
      return err(conflict("review sessions need a task in review assigned to this reviewer"));
    }
  } else if (task.assigneeId !== input.agentId || task.status !== "assigned") {
    return err(
      conflict(
        `task is ${task.status}${task.assigneeId === undefined ? " and unassigned" : ""}; only assigned tasks start sessions`,
      ),
    );
  }
  if (activeSessionOfTask(model, task.id) !== undefined) {
    return err(conflict("task already has an active session"));
  }
  const threadId = threadOfTask(model, task);
  const previous =
    input.mode === "triage" && threadId !== undefined
      ? resumableThreadSession(model, threadId, input.agentId)
      : resumableSession(model, task.id, input.agentId, input.mode);
  const session: Session = {
    id: ctx.ids.session(),
    taskId: task.id,
    agentId: input.agentId,
    mode: input.mode,
    state: "starting",
    ...compact({ threadId, resumedFrom: previous?.id }),
    round: task.reviewRounds,
    usage: ZERO_USAGE,
    startedAt: ctx.now,
  };
  const events: NewEvent[] = [{ type: "session.started", actor: ctx.actor, payload: { session } }];
  if (input.mode !== "review") {
    events.push(statusChange(ctx, task, "in_progress"));
  }
  return ok({ events, read: readSession(session.id) });
}

export function changeSessionState(
  model: ReadModel,
  input: {
    sessionId: SessionId;
    state: SessionState;
    runtimeSessionId?: string;
    sandboxId?: string;
    services?: SessionServices;
    runtime?: SessionRuntime;
    confirmed?: { model?: string; effort?: string };
    reason?: string;
  },
  ctx: CommandContext,
): CommandResult<Session> {
  return withSession(model, input.sessionId, (session) => {
    if (!isSessionActive(session.state)) {
      return ok({ events: [], read: readSession(session.id) });
    }
    const { sessionId, state, runtimeSessionId, sandboxId, services, runtime, confirmed, reason } =
      input;
    return ok({
      events: [
        {
          type: "session.state_changed",
          actor: ctx.actor,
          payload: {
            sessionId,
            state,
            ...compact({ runtimeSessionId, sandboxId, services, runtime, reason }),
            ...(confirmed === undefined ? {} : { confirmed: compact(confirmed) }),
          },
        },
      ],
      read: readSession(session.id),
    });
  });
}

export function recordSessionUsage(
  model: ReadModel,
  input: { sessionId: SessionId; usage: Usage; costUsd?: number },
  ctx: CommandContext,
): CommandResult<Session> {
  return withSession(model, input.sessionId, () =>
    ok({
      events: [{ type: "session.usage_recorded", actor: ctx.actor, payload: input }],
      read: readSession(input.sessionId),
    }),
  );
}

export function endSession(
  model: ReadModel,
  input: { sessionId: SessionId; state: "stopped" | "failed"; reason?: string },
  ctx: CommandContext,
): CommandResult<Session> {
  return withSession(model, input.sessionId, (session) => {
    const events: NewEvent[] = isSessionActive(session.state)
      ? [{ type: "session.ended", actor: ctx.actor, payload: { ...input, endedAt: ctx.now } }]
      : [];
    return ok({ events, read: readSession(session.id) });
  });
}
