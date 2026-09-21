import { z } from "zod";
import {
  Actor,
  Agent,
  ChatMessage,
  CommitSha,
  IsoDateTime,
  MailAck,
  MailItem,
  Project,
  SessionState,
  Task,
  TaskArtifacts,
  TaskNote,
  TaskPriority,
  TaskRating,
  TaskStatus,
  Usage,
} from "./domain.ts";
import {
  AgentId,
  ChatThreadId,
  EventId,
  MailItemId,
  MandateId,
  ProjectId,
  SessionId,
  TaskId,
} from "./ids.ts";
import {
  Baseline,
  Evidence,
  MANDATE_CRITERIA_MAX,
  Mandate,
  MandateArtifacts,
  MandateCriterion,
  MandateStatus,
} from "./mandate.ts";
import { Session, SessionRuntime } from "./session.ts";
import { TaskShape } from "./shape.ts";
import { ReviewStage, SessionServices } from "./roles.ts";

const Envelope = z.object({ id: EventId, at: IsoDateTime, actor: Actor });

const event = <TType extends string, TPayload extends z.ZodRawShape>(
  type: TType,
  payload: TPayload,
): ReturnType<
  typeof Envelope.extend<{ type: z.ZodLiteral<TType>; payload: z.ZodObject<TPayload> }>
> => Envelope.extend({ type: z.literal(type), payload: z.object(payload) });

export const DomainEvent = z.discriminatedUnion("type", [
  event("project.created", { project: Project }),
  event("project.updated", { project: Project }),
  event("project.removed", { projectId: ProjectId }),

  event("agent.created", { agent: Agent }),
  event("agent.updated", { agent: Agent }),
  event("agent.removed", { agentId: AgentId, reason: z.string().max(500).optional() }),

  event("task.created", { task: Task }),
  event("task.edited", {
    taskId: TaskId,
    title: Task.shape.title.optional(),
    brief: Task.shape.brief.optional(),
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
  event("task.shape_raised", {
    taskId: TaskId,
    from: TaskShape,
    to: TaskShape,
    reason: z.string().max(500),
  }),
  event("task.note_added", { taskId: TaskId, note: TaskNote }),
  event("task.review_recorded", {
    taskId: TaskId,
    verdict: z.enum(["approve", "request_changes"]),
    rounds: z.int().nonnegative(),
    commit: CommitSha.optional(),
  }),
  event("task.review_waived", {
    taskId: TaskId,
    stage: ReviewStage,
    reason: z.string().max(500).optional(),
  }),
  event("task.rated", { taskId: TaskId, rating: TaskRating }),
  event("task.removed", { taskId: TaskId }),

  event("mandate.opened", { mandate: Mandate }),
  event("mandate.acceptance_stated", {
    mandateId: MandateId,
    acceptance: z.array(MandateCriterion).max(MANDATE_CRITERIA_MAX),
  }),
  event("mandate.evidence_recorded", { mandateId: MandateId, evidence: Evidence }),
  event("mandate.artifacts_changed", { mandateId: MandateId, artifacts: MandateArtifacts }),
  event("mandate.baseline_recorded", { mandateId: MandateId, baseline: Baseline }),
  event("mandate.status_changed", {
    mandateId: MandateId,
    from: MandateStatus,
    to: MandateStatus,
    reason: z.string().max(2000).optional(),
  }),
  event("mandate.round_opened", {
    mandateId: MandateId,
    round: z.int().positive(),
    reason: z.string().max(2000),
  }),

  event("handoff.requested", {
    taskId: TaskId,
    fromAgentId: AgentId,
    toAgentId: AgentId,
    brief: z.string().max(8000),
  }),

  event("chat.message_posted", { message: ChatMessage }),
  event("chat.cleared", { projectId: ProjectId, threadId: ChatThreadId.optional() }),

  event("mail.received", { mail: MailItem }),
  event("mail.acknowledged", { mailId: MailItemId, ack: MailAck }),

  event("session.started", { session: Session }),
  event("session.state_changed", {
    sessionId: SessionId,
    state: SessionState,
    runtimeSessionId: z.string().optional(),
    sandboxId: z.string().optional(),
    services: SessionServices.optional(),
    runtime: SessionRuntime.optional(),
    confirmed: z.object({ model: z.string().optional(), effort: z.string().optional() }).optional(),
    reason: z.string().max(2000).optional(),
  }),
  event("session.usage_recorded", {
    sessionId: SessionId,
    usage: Usage,
    costUsd: z.number().nonnegative().optional(),
    costBasis: z.string().max(40).optional(),
    ttftMs: z.int().nonnegative().optional(),
  }),
  event("session.ended", {
    sessionId: SessionId,
    state: z.enum(["stopped", "failed"]),
    endedAt: IsoDateTime,
    reason: z.string().max(2000).optional(),
  }),
  event("session.plan_recorded", {
    sessionId: SessionId,
    percent: z.number().nonnegative(),
  }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;

export const StoredEvent = z.intersection(DomainEvent, z.object({ seq: z.int().nonnegative() }));
export type StoredEvent = DomainEvent & { seq: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewEvent = DistributiveOmit<DomainEvent, "id" | "at">;
