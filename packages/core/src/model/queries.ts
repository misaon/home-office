import {
  type Agent,
  type AgentId,
  type Attachment,
  type ChatMessage,
  type ChatThreadId,
  isSessionActive,
  type MailConnector,
  type MailItem,
  type Mandate,
  type MandateId,
  type ProjectId,
  type Session,
  type SessionMode,
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

type Lineage = {
  tasks: ReadonlyMap<TaskId, Task>;
  mandates: ReadonlyMap<MandateId, Mandate>;
};

export const parentOf = (model: Lineage, task: Task): Task | undefined => {
  const { source } = task;
  if (source.kind === "delegation") {
    return source.parentTaskId === undefined ? undefined : model.tasks.get(source.parentTaskId);
  }
  if (source.kind === "mandate") {
    const root = model.mandates.get(source.mandateId)?.rootTaskId;
    return root === undefined || root === task.id ? undefined : model.tasks.get(root);
  }
  return undefined;
};

export function threadOfTask(
  model: Lineage & { chat: ReadonlyMap<ProjectId, readonly ChatMessage[]> },
  task: Task,
): ChatThreadId | undefined {
  let current: Task | undefined = task;
  for (let depth = 0; depth < THREAD_WALK_MAX && current !== undefined; depth += 1) {
    const source: Task["source"] = current.source;
    if (source.kind === "chat") {
      return chatOf(model, current.projectId).find((m) => m.id === source.messageId)?.threadId;
    }
    current = parentOf(model, current);
  }
  return undefined;
}

export const tasksOf = (
  model: Pick<ReadModel, "tasks" | "tasksByProject">,
  projectId: ProjectId,
): Task[] => resolve(model.tasks, model.tasksByProject.get(projectId));

export const mandatesOf = (
  model: Pick<ReadModel, "mandates" | "mandatesByProject">,
  projectId: ProjectId,
): Mandate[] => resolve(model.mandates, model.mandatesByProject.get(projectId));

export const tasksOfMandate = (
  model: Pick<ReadModel, "tasks" | "tasksByMandate">,
  mandate: Pick<Mandate, "id">,
): Task[] => resolve(model.tasks, model.tasksByMandate.get(mandate.id));

export const dependenciesOf = (model: Pick<ReadModel, "tasks">, task: Task): Task[] =>
  task.dependsOn.flatMap((id) => {
    const dependency = model.tasks.get(id);
    return dependency === undefined ? [] : [dependency];
  });

export const openDependenciesOf = (model: Pick<ReadModel, "tasks">, task: Task): Task[] =>
  dependenciesOf(model, task).filter((dependency) => dependency.status !== "done");

export const dependentsOf = (
  model: Pick<ReadModel, "tasks" | "tasksByProject">,
  task: Task,
): Task[] => tasksOf(model, task.projectId).filter((other) => other.dependsOn.includes(task.id));

export const findAgentByRef = (
  model: ReadModel,
  ref: string,
  projectId?: ProjectId,
): Agent | undefined =>
  (projectId === undefined ? [...model.agents.values()] : membersOf(model, projectId)).find(
    (a) => a.id === ref || a.name.toLowerCase() === ref.toLowerCase(),
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
  mode: SessionMode,
): Session | undefined =>
  sessionsOfTask(model, taskId)
    .filter(
      (s) =>
        s.agentId === agentId &&
        s.mode === mode &&
        !isSessionActive(s.state) &&
        s.runtimeSessionId !== undefined,
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
        s.threadId === threadId &&
        s.mode === "triage" &&
        !isSessionActive(s.state) &&
        s.runtimeSessionId !== undefined,
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
  model: Lineage & Pick<ReadModel, "chat" | "tasksByMandate">,
  task: Task,
): readonly Attachment[] {
  const roots = new Set<TaskId>();
  const sources = new Set<string>();
  let current: Task | undefined = task;
  for (let depth = 0; depth < THREAD_WALK_MAX && current !== undefined; depth += 1) {
    roots.add(current.id);
    const source: Task["source"] = current.source;
    if (source.kind === "chat") {
      sources.add(source.messageId);
      break;
    }
    current = parentOf(model, current);
  }
  const siblings = new Set<TaskId>(
    task.mandateId === undefined ? [] : (model.tasksByMandate.get(task.mandateId) ?? []),
  );
  return chatOf(model, task.projectId)
    .filter((m) =>
      m.author.kind === "human"
        ? (m.taskId !== undefined && roots.has(m.taskId)) || sources.has(m.id)
        : m.taskId !== undefined && (roots.has(m.taskId) || siblings.has(m.taskId)),
    )
    .flatMap((m) => m.attachments);
}

export function mailForTask(
  model: Lineage & Pick<ReadModel, "mail" | "mailBySource">,
  task: Task,
): MailItem | undefined {
  let current: Task | undefined = task;
  for (let depth = 0; current !== undefined && depth < THREAD_WALK_MAX; depth += 1) {
    const { source } = current;
    if (source.kind === "mail") {
      return findMail(model, current.projectId, source.connector, source.externalId);
    }
    current = parentOf(model, current);
  }
  return undefined;
}
