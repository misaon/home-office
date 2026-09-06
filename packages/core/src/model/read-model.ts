import type {
  Agent,
  AgentId,
  ChatMessage,
  Project,
  ProjectId,
  Session,
  SessionId,
  Task,
  TaskId,
} from "@ho/protocol";

/** In-memory projection of the event log. Mutated only by `applyEvent`. */
export type ReadModel = {
  projects: Map<ProjectId, Project>;
  agents: Map<AgentId, Agent>;
  tasks: Map<TaskId, Task>;
  sessions: Map<SessionId, Session>;
  chat: ChatMessage[];
  lastSeq: number;
};

export const createReadModel = (): ReadModel => ({
  projects: new Map(),
  agents: new Map(),
  tasks: new Map(),
  sessions: new Map(),
  chat: [],
  lastSeq: -1,
});
