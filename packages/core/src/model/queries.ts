import {
  type Agent,
  type AgentId,
  type Attachment,
  type ChatMessage,
  type ChatThreadId,
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

type Roster = {
  agents: ReadonlyMap<AgentId, Agent>;
  agentsByProject: ReadonlyMap<ProjectId, ReadonlySet<AgentId>>;
};

export const membersOf = (model: Roster, projectId: ProjectId): Agent[] =>
  resolve(model.agents, model.agentsByProject.get(projectId));

export const bossOf = (model: Roster, projectId: ProjectId): Agent | undefined =>
  membersOf(model, projectId).find((a) => a.role === "boss");

export const chatOf = (
  model: { chat: ReadonlyMap<ProjectId, readonly ChatMessage[]> },
  projectId: ProjectId,
): readonly ChatMessage[] => model.chat.get(projectId) ?? [];

export const awaitsAnswer = (task: Task): boolean =>
  task.status === "blocked" &&
  task.notes.findLast((note) => note.kind === "question" || note.kind === "answer")?.kind ===
    "question";

export const latestThread = (
  model: { chat: ReadonlyMap<ProjectId, readonly ChatMessage[]> },
  projectId: ProjectId,
): ChatThreadId | undefined =>
  chatOf(model, projectId).findLast((m) => m.threadId !== undefined)?.threadId;

const THREAD_WALK_MAX = 8;

export function threadOfTask(
  model: Pick<ReadModel, "chat" | "tasks">,
  task: Task,
): ChatThreadId | undefined {
  let current: Task | undefined = task;
  for (let depth = 0; depth < THREAD_WALK_MAX && current !== undefined; depth += 1) {
    const source: Task["source"] = current.source;
    if (source.kind === "chat") {
      return chatOf(model, current.projectId).find((m) => m.id === source.messageId)?.threadId;
    }
    if (source.kind !== "delegation" || source.parentTaskId === undefined) {
      return undefined;
    }
    current = model.tasks.get(source.parentTaskId);
  }
  return undefined;
}

export const tasksOf = (
  model: Pick<ReadModel, "tasks" | "tasksByProject">,
  projectId: ProjectId,
): Task[] => resolve(model.tasks, model.tasksByProject.get(projectId));

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

export const sessionsOfTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  taskId: TaskId,
): Session[] => resolve(model.sessions, model.sessionsByTask.get(taskId));

export const sessionsOfAgent = (
  model: Pick<ReadModel, "sessions" | "sessionsByAgent">,
  agentId: AgentId,
): Session[] => resolve(model.sessions, model.sessionsByAgent.get(agentId));

export const activeSessions = (model: Pick<ReadModel, "sessions" | "activeSessions">): Session[] =>
  resolve(model.sessions, model.activeSessions);

export const activeSessionOfTask = (
  model: Pick<ReadModel, "sessions" | "sessionsByTask">,
  taskId: TaskId,
): Session | undefined => sessionsOfTask(model, taskId).find((s) => isSessionActive(s.state));

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

export const resumableThreadSession = (
  model: Pick<ReadModel, "sessions" | "sessionsByAgent">,
  threadId: ChatThreadId,
  agentId: AgentId,
): Session | undefined =>
  sessionsOfAgent(model, agentId)
    .filter(
      (s) =>
        s.threadId === threadId && !isSessionActive(s.state) && s.runtimeSessionId !== undefined,
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

export function attachmentsOfTask(
  model: Pick<ReadModel, "chat">,
  task: Task,
): readonly Attachment[] {
  const source = task.source.kind === "chat" ? task.source.messageId : undefined;
  return chatOf(model, task.projectId)
    .filter((m) => m.author.kind === "human" && (m.taskId === task.id || m.id === source))
    .flatMap((m) => m.attachments);
}

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
