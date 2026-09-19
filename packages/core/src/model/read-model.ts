import type {
  Agent,
  AgentId,
  ChatMessage,
  MailConnector,
  MailItem,
  MailItemId,
  Project,
  ProjectId,
  Session,
  SessionId,
  Task,
  TaskId,
} from "@ho/protocol";

export type ReadModel = {
  projects: Map<ProjectId, Project>;
  agents: Map<AgentId, Agent>;
  formerAgents: Map<AgentId, Agent>;
  tasks: Map<TaskId, Task>;
  sessions: Map<SessionId, Session>;
  chat: Map<ProjectId, ChatMessage[]>;
  mail: Map<MailItemId, MailItem>;
  lastSeq: number;
  agentsByProject: Map<ProjectId, Set<AgentId>>;
  tasksByProject: Map<ProjectId, Set<TaskId>>;
  sessionsByTask: Map<TaskId, Set<SessionId>>;
  sessionsByAgent: Map<AgentId, Set<SessionId>>;
  activeSessions: Set<SessionId>;
  mailBySource: Map<string, MailItemId>;
  rateLimits: string[];
  rateLimitsSeen: number;
  revisions: Record<Collection, number>;
};

export type Collection = "projects" | "agents" | "tasks" | "sessions" | "chat" | "mail";

export const createReadModel = (): ReadModel => ({
  projects: new Map(),
  agents: new Map(),
  formerAgents: new Map(),
  tasks: new Map(),
  sessions: new Map(),
  chat: new Map(),
  mail: new Map(),
  lastSeq: -1,
  agentsByProject: new Map(),
  tasksByProject: new Map(),
  sessionsByTask: new Map(),
  sessionsByAgent: new Map(),
  activeSessions: new Set(),
  mailBySource: new Map(),
  rateLimits: [],
  rateLimitsSeen: 0,
  revisions: { projects: 0, agents: 0, tasks: 0, sessions: 0, chat: 0, mail: 0 },
});

export const RATE_LIMIT_TAIL = 1000;

export const RATE_LIMITED = "rate limited";

export const rateLimitedReason = (retryAt: string | null | undefined): string =>
  `${RATE_LIMITED} until ${retryAt ?? "unknown"}`;

export const CHAT_TAIL = 500;

export const mailSourceKey = (
  projectId: ProjectId,
  connector: MailConnector,
  externalId: string,
): string => `${projectId}\u0000${connector}\u0000${externalId}`;

export const indexInto = <K, V>(index: Map<K, Set<V>>, key: K, value: V): void => {
  const bucket = index.get(key);
  if (bucket === undefined) {
    index.set(key, new Set([value]));
    return;
  }
  bucket.add(value);
};

export const dropFrom = <K, V>(index: Map<K, Set<V>>, key: K, value: V): void => {
  const bucket = index.get(key);
  if (bucket === undefined) {
    return;
  }
  bucket.delete(value);
  if (bucket.size === 0) {
    index.delete(key);
  }
};

export const resolve = <K, V>(
  entities: ReadonlyMap<K, V>,
  ids: ReadonlySet<K> | undefined,
): V[] => {
  if (ids === undefined) {
    return [];
  }
  const found: V[] = [];
  for (const id of ids) {
    const entity = entities.get(id);
    if (entity !== undefined) {
      found.push(entity);
    }
  }
  return found;
};
