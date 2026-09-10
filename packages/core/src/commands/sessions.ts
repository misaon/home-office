import {
  type AgentId,
  compact,
  type NewEvent,
  type Session,
  type SessionId,
  type SessionMode,
  type SessionServices,
  type SessionState,
  type TaskId,
  type Usage,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import { type ReadModel, resolve } from "../model/read-model.ts";
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

/** Prefix of the `session.state_changed` reason the projection counts as a rate-limit incident. */
export const RATE_LIMITED = "rate limited";

export const rateLimitedReason = (retryAt: string | null | undefined): string =>
  `${RATE_LIMITED} until ${retryAt ?? "unknown"}`;

/** The most recent finished session of this agent on this task that has a resumable runtime conversation. */
export const resumableSession = (
  model: ReadModel,
  taskId: TaskId,
  agentId: AgentId,
): Session | undefined =>
  sessionsOfTask(model, taskId)
    .filter(
      (s) => s.agentId === agentId && !isSessionActive(s.state) && s.runtimeSessionId !== undefined,
    )
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

/** Every session ever opened on this task, in start order. */
export const sessionsOfTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  taskId: TaskId,
): Session[] => resolve(model.sessions, model.sessionsByTask.get(taskId));

/** Every session ever opened by this agent, in start order. */
export const sessionsOfAgent = (
  model: Pick<ReadModel, "sessions" | "sessionsByAgent">,
  agentId: AgentId,
): Session[] => resolve(model.sessions, model.sessionsByAgent.get(agentId));

/** The sessions that have not stopped or failed. */
export const activeSessions = (model: Pick<ReadModel, "sessions" | "activeSessions">): Session[] =>
  resolve(model.sessions, model.activeSessions);

export const activeSessionOfTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  taskId: TaskId,
): Session | undefined => sessionsOfTask(model, taskId).find((s) => isSessionActive(s.state));

/**
 * Opens a session. `work`/`triage` start on an assigned task and move it to `in_progress`; `review` runs the
 * task's reviewer on a task in `review` without changing the task status.
 */
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
  if ((input.mode === "triage") !== (task.kind === "triage")) {
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
  const previous = resumableSession(model, task.id, input.agentId);
  const session: Session = {
    id: ctx.ids.session(),
    taskId: task.id,
    agentId: input.agentId,
    mode: input.mode,
    state: "starting",
    ...compact({ resumedFrom: previous?.id }),
    usage: ZERO_USAGE,
    startedAt: ctx.now,
  };
  const events: NewEvent[] = [{ type: "session.started", actor: ctx.actor, payload: { session } }];
  if (input.mode !== "review") {
    events.push({
      type: "task.status_changed",
      actor: ctx.actor,
      payload: { taskId: task.id, from: "assigned", to: "in_progress" },
    });
  }
  return ok({ events, value: session });
}

export function changeSessionState(
  model: ReadModel,
  input: {
    sessionId: SessionId;
    state: SessionState;
    runtimeSessionId?: string;
    sandboxId?: string;
    services?: SessionServices;
    reason?: string;
  },
  ctx: CommandContext,
): CommandResult<Session> {
  const session = model.sessions.get(input.sessionId);
  if (session === undefined) {
    return err(notFound("session", input.sessionId));
  }
  if (!isSessionActive(session.state)) {
    return err(conflict("a finished session cannot change state"));
  }
  const { sessionId, ...rest } = input;
  const next: Session = {
    ...session,
    ...compact(rest),
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
    value: {
      ...session,
      usage: {
        inputTokens: session.usage.inputTokens + input.usage.inputTokens,
        outputTokens: session.usage.outputTokens + input.usage.outputTokens,
        cacheReadTokens: session.usage.cacheReadTokens + input.usage.cacheReadTokens,
        cacheWriteTokens: session.usage.cacheWriteTokens + input.usage.cacheWriteTokens,
        turns: session.usage.turns + input.usage.turns,
      },
    },
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
  if (!isSessionActive(session.state)) {
    return ok({ events: [], value: session });
  }
  const next: Session = { ...session, state: input.state, endedAt: ctx.now };
  return ok({
    events: [{ type: "session.ended", actor: ctx.actor, payload: { ...input, endedAt: ctx.now } }],
    value: next,
  });
}
