import { z } from "zod";
import {
  Agent,
  Author,
  ChatMessage,
  IsoDateTime,
  Project,
  Session,
  SessionState,
  Task,
  TaskArtifacts,
  TaskPriority,
  TaskStatus,
  Usage,
} from "./domain.ts";
import { AgentId, EventId, ProjectId, SessionId, TaskId } from "./ids.ts";

/** Who caused an event. Agents act through the daemon; the daemon itself is `system`. */
export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("agent"), agentId: AgentId }),
  z.object({ kind: z.literal("system") }),
]);
export type Actor = z.infer<typeof Actor>;

const Envelope = z.object({
  id: EventId,
  at: IsoDateTime,
  actor: Actor,
  /** Groups everything that happened because of one request (a chat message, a mail item). */
  correlationId: z.string().min(1).optional(),
  /** The event that directly caused this one. */
  causationId: EventId.optional(),
});

const event = <TType extends string, TPayload extends z.ZodRawShape>(
  type: TType,
  payload: TPayload,
) => Envelope.extend({ type: z.literal(type), payload: z.object(payload) });

/** Persisted domain events. Keep these coarse: live agent chatter is streamed, not stored. */
export const DomainEvent = z.discriminatedUnion("type", [
  event("project.created", { project: Project }),
  event("project.updated", { project: Project }),
  event("project.removed", { projectId: ProjectId }),

  event("agent.created", { agent: Agent }),
  event("agent.updated", { agent: Agent }),
  event("agent.removed", { agentId: AgentId }),

  event("task.created", { task: Task }),
  event("task.edited", {
    taskId: TaskId,
    title: z.string().min(1).max(200).optional(),
    brief: z.string().max(20000).optional(),
    priority: TaskPriority.optional(),
  }),
  event("task.assigned", { taskId: TaskId, agentId: AgentId.nullable() }),
  event("task.status_changed", {
    taskId: TaskId,
    from: TaskStatus,
    to: TaskStatus,
    reason: z.string().max(2000).optional(),
  }),
  event("task.artifacts_changed", { taskId: TaskId, artifacts: TaskArtifacts }),

  event("chat.message_posted", { message: ChatMessage, author: Author }),

  event("session.started", { session: Session }),
  event("session.state_changed", {
    sessionId: SessionId,
    state: SessionState,
    runtimeSessionId: z.string().optional(),
    sandboxId: z.string().optional(),
    reason: z.string().max(2000).optional(),
  }),
  event("session.usage_recorded", { sessionId: SessionId, usage: Usage }),
  event("session.ended", {
    sessionId: SessionId,
    state: z.enum(["stopped", "failed"]),
    endedAt: IsoDateTime,
    reason: z.string().max(2000).optional(),
  }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent["type"];
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/** An event as returned by the store: the append order becomes `seq`. */
export const StoredEvent = z.intersection(DomainEvent, z.object({ seq: z.int().nonnegative() }));
export type StoredEvent = DomainEvent & { seq: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What a producer hands to the store: everything but `id`, `at` and `seq`, which the store assigns. */
export type NewEvent = DistributiveOmit<DomainEvent, "id" | "at">;
