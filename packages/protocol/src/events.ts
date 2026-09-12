import type { DistributedOmit } from "type-fest";
import { z } from "zod";
import {
  Actor,
  Agent,
  Author,
  ChatMessage,
  IsoDateTime,
  MailAck,
  MailItem,
  Project,
  Session,
  SessionServices,
  SessionState,
  Task,
  TaskArtifacts,
  TaskNote,
  TaskPriority,
  TaskStatus,
  Usage,
} from "./domain.ts";
import { AgentId, EventId, MailItemId, ProjectId, SessionId, TaskId } from "./ids.ts";

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
): ReturnType<
  typeof Envelope.extend<{ type: z.ZodLiteral<TType>; payload: z.ZodObject<TPayload> }>
> => Envelope.extend({ type: z.literal(type), payload: z.object(payload) });

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
  event("task.reviewer_assigned", { taskId: TaskId, reviewerId: AgentId.nullable() }),
  event("task.status_changed", {
    taskId: TaskId,
    from: TaskStatus,
    to: TaskStatus,
    reason: z.string().max(2000).optional(),
  }),
  event("task.artifacts_changed", { taskId: TaskId, artifacts: TaskArtifacts }),
  event("task.note_added", { taskId: TaskId, note: TaskNote }),
  event("task.review_recorded", {
    taskId: TaskId,
    verdict: z.enum(["approve", "request_changes"]),
    rounds: z.int().nonnegative(),
  }),

  /** Drives the office animation: the source agent walks over and hands the folder to the target. */
  event("handoff.requested", {
    taskId: TaskId,
    fromAgentId: AgentId,
    toAgentId: AgentId,
    brief: z.string().max(8000),
  }),

  event("chat.message_posted", { message: ChatMessage, author: Author }),

  /** The postman's trigger: a connector delivered an item (its task is created in the same command). */
  event("mail.received", { mail: MailItem }),
  event("mail.acknowledged", { mailId: MailItemId, ack: MailAck }),

  event("session.started", { session: Session }),
  event("session.state_changed", {
    sessionId: SessionId,
    state: SessionState,
    runtimeSessionId: z.string().optional(),
    sandboxId: z.string().optional(),
    services: SessionServices.optional(),
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

/** What a producer hands to the store: everything but `id`, `at` and `seq`, which the store assigns. */
export type NewEvent = DistributedOmit<DomainEvent, "id" | "at">;
