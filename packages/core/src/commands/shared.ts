import {
  type Agent,
  type AgentId,
  type ChatMessage,
  compact,
  headline,
  type NewEvent,
  notFound,
  type Project,
  type ProjectId,
  type Session,
  type SessionId,
  type Task,
  type TaskId,
  type TaskNote,
  type TaskStatus,
} from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err } from "../result.ts";

export const TITLE_MAX = 200;

export const titleFromText = (text: string): string => headline(text, TITLE_MAX);

export const note = (ctx: CommandContext, kind: TaskNote["kind"], text: string): TaskNote => ({
  at: ctx.now,
  author: ctx.actor,
  kind,
  text,
});

export const noteEvent = (ctx: CommandContext, task: Task, n: TaskNote): NewEvent => ({
  type: "task.note_added",
  actor: ctx.actor,
  payload: { taskId: task.id, note: n },
});

export const statusChange = (
  ctx: CommandContext,
  task: Task,
  to: TaskStatus,
  reason?: string,
): NewEvent => ({
  type: "task.status_changed",
  actor: ctx.actor,
  payload: { taskId: task.id, from: task.status, to, ...compact({ reason }) },
});

export const handoffEvent = (
  ctx: CommandContext,
  taskId: TaskId,
  fromAgentId: AgentId,
  toAgentId: AgentId,
  brief: string,
): NewEvent => ({
  type: "handoff.requested",
  actor: ctx.actor,
  payload: { taskId, fromAgentId, toAgentId, brief },
});

export const chatEvent = (ctx: CommandContext, message: ChatMessage): NewEvent => ({
  type: "chat.message_posted",
  actor: ctx.actor,
  payload: { message },
});

const withEntity =
  <Id extends string, Value>(
    kind: Parameters<typeof notFound>[0],
    entities: ReadonlyMap<Id, Value>,
  ) =>
  <T>(id: Id, then: (value: Value) => CommandResult<T>): CommandResult<T> => {
    const value = entities.get(id);
    return value === undefined ? err(notFound(kind, id)) : then(value);
  };

export const withProject = <T>(
  model: ReadModel,
  projectId: ProjectId,
  then: (project: Project) => CommandResult<T>,
): CommandResult<T> => withEntity("project", model.projects)(projectId, then);

export const withAgent = <T>(
  model: ReadModel,
  agentId: AgentId,
  then: (agent: Agent) => CommandResult<T>,
): CommandResult<T> => withEntity("agent", model.agents)(agentId, then);

export const withTask = <T>(
  model: ReadModel,
  taskId: TaskId,
  then: (task: Task) => CommandResult<T>,
): CommandResult<T> => withEntity("task", model.tasks)(taskId, then);

export const withSession = <T>(
  model: ReadModel,
  sessionId: SessionId,
  then: (session: Session) => CommandResult<T>,
): CommandResult<T> => withEntity("session", model.sessions)(sessionId, then);
