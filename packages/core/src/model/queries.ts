import {
  type Agent,
  type AgentId,
  type Attachment,
  type ChatMessage,
  isSessionActive,
  type MailConnector,
  type MailItem,
  type MailItemId,
  type ProjectId,
  type Session,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { mailSourceKey, type ReadModel, resolve } from "./read-model.ts";

/** Enough of the model to find a floor's staff; the UI's immutable snapshot fits too. */
type Roster = {
  agents: ReadonlyMap<AgentId, Agent>;
  agentsByProject: ReadonlyMap<ProjectId, ReadonlySet<AgentId>>;
};

/** The staff of one floor (its boss included). */
export const membersOf = (model: Roster, projectId: ProjectId): Agent[] =>
  resolve(model.agents, model.agentsByProject.get(projectId));

/** The floor's boss; every floor gets one when it is created, so `undefined` only shows up mid-removal. */
export const bossOf = (model: Roster, projectId: ProjectId): Agent | undefined =>
  membersOf(model, projectId).find((a) => a.role === "boss");

/** The floor's recent chat, oldest first; the full history lives in the event log. */
export const chatOf = (
  model: { chat: ReadonlyMap<ProjectId, readonly ChatMessage[]> },
  projectId: ProjectId,
): readonly ChatMessage[] => model.chat.get(projectId) ?? [];

/** The floor's tasks, in creation order. */
export const tasksOf = (
  model: Pick<ReadModel, "tasks" | "tasksByProject">,
  projectId: ProjectId,
): Task[] => resolve(model.tasks, model.tasksByProject.get(projectId));

/** Agents refer to colleagues by name in tool calls; ids also work. Scoped to a floor when one is given. */
export const findAgentByRef = (
  model: ReadModel,
  ref: string,
  projectId?: ProjectId,
): Agent | undefined =>
  [...model.agents.values()].find(
    (a) =>
      (projectId === undefined || a.projectId === projectId) &&
      (a.id === ref || a.name.toLowerCase() === ref.toLowerCase()),
  );

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

export const findMail = (
  model: Pick<ReadModel, "mail" | "mailBySource">,
  projectId: ProjectId,
  connector: MailConnector,
  externalId: string,
): MailItem | undefined => {
  const id = model.mailBySource.get(mailSourceKey(projectId, connector, externalId));
  return id === undefined ? undefined : model.mail.get(id);
};

/**
 * Everything the human attached to a task: the message that started it and any answer since. Ordered as
 * the chat is, so a session sees them in the order they were sent.
 */
export function attachmentsOfTask(
  model: Pick<ReadModel, "chat">,
  task: Task,
): readonly Attachment[] {
  const source = task.source.kind === "chat" ? task.source.messageId : undefined;
  return chatOf(model, task.projectId)
    .filter((m) => m.author.kind === "human" && (m.taskId === task.id || m.id === source))
    .flatMap((m) => m.attachments);
}

/** The mail item behind a task: its own, or the one behind the triage task that delegated it. */
export function mailForTask(
  model: { tasks: ReadonlyMap<TaskId, Task>; mail: ReadonlyMap<MailItemId, MailItem> },
  task: Task,
): MailItem | undefined {
  let current: Task | undefined = task;
  for (let depth = 0; current !== undefined && depth < 4; depth += 1) {
    const id: TaskId = current.id;
    if (current.source.kind === "mail") {
      return [...model.mail.values()].find((m) => m.taskId === id);
    }
    if (current.source.kind !== "delegation" || current.source.parentTaskId === undefined) {
      return undefined;
    }
    current = model.tasks.get(current.source.parentTaskId);
  }
  return undefined;
}
