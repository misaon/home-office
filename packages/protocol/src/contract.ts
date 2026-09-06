import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import {
  Agent,
  AuthKind,
  Budgets,
  ChatMessage,
  IntakePolicy,
  IsoDateTime,
  MailItem,
  Project,
  PublishPolicy,
  Session,
  Task,
  TaskArtifacts,
  TaskPriority,
  TaskStatus,
  Usage,
} from "./domain.ts";
import { StoredEvent } from "./events.ts";
import { IntakePollResult, IntakeStatus } from "./intake.ts";
import { SecretKeyName } from "./providers.ts";
import { AgentId, ProjectId, SessionId, TaskId } from "./ids.ts";
import { Doctor, LiveEvent, ResourceInventory } from "./runtime-events.ts";

// ---- shared errors ------------------------------------------------------------------------------

const errors = {
  NOT_FOUND: {
    message: "Entity not found",
    data: z.object({ entity: z.string(), id: z.string() }),
  },
  CONFLICT: {
    message: "The request conflicts with the current state",
    data: z.object({ reason: z.string() }),
  },
  INVALID_TRANSITION: {
    message: "Task status transition is not allowed",
    data: z.object({ from: TaskStatus, to: TaskStatus }),
  },
} as const;

// ---- inputs -------------------------------------------------------------------------------------

const ProjectFields = Project.pick({
  name: true,
  repo: true,
  defaultBranch: true,
  floorTemplateId: true,
  publish: true,
  intake: true,
});
export const ProjectCreateInput = ProjectFields;
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>;
/**
 * Patches carry only the keys a client sent. `.partial()` alone would re-apply field defaults to absent
 * keys, so defaulted fields are unwrapped here (a patch of `{ name }` must not reset the branch or policy).
 */
const ProjectPatch = z
  .object({
    name: Project.shape.name,
    repo: Project.shape.repo,
    defaultBranch: Project.shape.defaultBranch.unwrap(),
    floorTemplateId: Project.shape.floorTemplateId.unwrap(),
    publish: PublishPolicy,
    intake: IntakePolicy,
  })
  .partial();
export const ProjectUpdateInput = z.object({ id: ProjectId, patch: ProjectPatch });
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

const AgentFields = Agent.pick({
  name: true,
  role: true,
  appearance: true,
  provider: true,
  model: true,
  effort: true,
  basePrompt: true,
  skillPack: true,
  projectIds: true,
}).extend({
  /** Omitted: the provider's default (subscription for Claude Code, API key elsewhere). */
  auth: AuthKind.optional(),
  budgets: Budgets.prefault({}),
});
export const AgentCreateInput = AgentFields;
export type AgentCreateInput = z.infer<typeof AgentCreateInput>;
/** See ProjectPatch: a model change must keep the persona, skill pack, projects and budgets. */
const AgentPatch = z
  .object({
    name: Agent.shape.name,
    role: Agent.shape.role,
    appearance: Agent.shape.appearance,
    provider: Agent.shape.provider,
    auth: AuthKind,
    model: Agent.shape.model,
    effort: Agent.shape.effort,
    basePrompt: Agent.shape.basePrompt.unwrap(),
    skillPack: Agent.shape.skillPack.unwrap(),
    projectIds: Agent.shape.projectIds.unwrap(),
    budgets: Budgets,
  })
  .partial();
export const AgentUpdateInput = z.object({ id: AgentId, patch: AgentPatch });
export type AgentUpdateInput = z.infer<typeof AgentUpdateInput>;

export const TaskCreateInput = z.object({
  projectId: ProjectId,
  title: z.string().min(1).max(200),
  brief: z.string().max(20000).default(""),
  priority: TaskPriority.default("normal"),
  parentId: TaskId.optional(),
  assigneeId: AgentId.optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export const TaskListInput = z.object({
  projectId: ProjectId.optional(),
  status: z.array(TaskStatus).min(1).optional(),
});
export type TaskListInput = z.infer<typeof TaskListInput>;
export const TaskEditInput = z.object({
  id: TaskId,
  title: z.string().min(1).max(200).optional(),
  brief: z.string().max(20000).optional(),
  priority: TaskPriority.optional(),
});
export type TaskEditInput = z.infer<typeof TaskEditInput>;
export const TaskAssignInput = z.object({ id: TaskId, agentId: AgentId.nullable() });
export type TaskAssignInput = z.infer<typeof TaskAssignInput>;
export const TaskTransitionInput = z.object({
  id: TaskId,
  to: TaskStatus,
  reason: z.string().max(2000).optional(),
});
export type TaskTransitionInput = z.infer<typeof TaskTransitionInput>;
export const TaskArtifactsInput = z.object({ id: TaskId, artifacts: TaskArtifacts });
export type TaskArtifactsInput = z.infer<typeof TaskArtifactsInput>;

export const ChatSendInput = z.object({
  text: z.string().min(1).max(20000),
  /** When given, the message also opens an inbox task in that project. Without it the boss triages the message. */
  projectId: ProjectId.optional(),
  /** Answers a question an agent asked about this task; the task resumes. */
  taskId: TaskId.optional(),
});
export type ChatSendInput = z.infer<typeof ChatSendInput>;
export const ChatHistoryInput = z.object({ limit: z.int().positive().max(500).default(100) });

export const SessionListInput = z.object({
  taskId: TaskId.optional(),
  active: z.boolean().optional(),
});
export type SessionListInput = z.infer<typeof SessionListInput>;
export const SessionStreamInput = z.object({ sessionId: SessionId.optional() });
export type SessionStreamInput = z.infer<typeof SessionStreamInput>;

export const UsageSummaryInput = z.object({
  sinceHours: z
    .number()
    .positive()
    .max(24 * 365)
    .optional(),
});
export type UsageSummaryInput = z.infer<typeof UsageSummaryInput>;
export const UsageBucket = z.object({
  key: z.string(),
  label: z.string(),
  usage: Usage,
  sessions: z.int().nonnegative(),
});
export const UsageSummary = z.object({
  since: IsoDateTime.nullable(),
  totals: Usage,
  sessions: z.int().nonnegative(),
  rateLimitIncidents: z.int().nonnegative(),
  byAgent: z.array(UsageBucket),
  byProject: z.array(UsageBucket),
  byDay: z.array(UsageBucket),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

export const EventsSubscribeInput = z.object({ afterSeq: z.int().nonnegative().optional() });
export type EventsSubscribeInput = z.infer<typeof EventsSubscribeInput>;

export const Health = z.object({
  ok: z.literal(true),
  version: z.string(),
  startedAt: IsoDateTime,
  uptimeMs: z.int().nonnegative(),
});
export type Health = z.infer<typeof Health>;

// ---- contract -----------------------------------------------------------------------------------

const base = oc.errors(errors);

export const contract = {
  system: {
    health: base.output(Health),
    doctor: base.output(Doctor),
    /** Builds (or refreshes) the agent and git-bridge images, streaming build output. */
    buildImages: base.output(eventIterator(z.object({ line: z.string() }))),
    /** Removes stopped sandboxes, expired task volumes and dangling images. */
    gc: base.output(
      z.object({
        containers: z.array(z.string()),
        volumes: z.array(z.string()),
        images: z.array(z.string()),
      }),
    ),
  },
  projects: {
    list: base.output(z.array(Project)),
    create: base.input(ProjectCreateInput).output(Project),
    update: base.input(ProjectUpdateInput).output(Project),
    remove: base.input(z.object({ id: ProjectId })).output(z.object({ id: ProjectId })),
  },
  agents: {
    list: base.output(z.array(Agent)),
    create: base.input(AgentCreateInput).output(Agent),
    update: base.input(AgentUpdateInput).output(Agent),
    remove: base.input(z.object({ id: AgentId })).output(z.object({ id: AgentId })),
  },
  tasks: {
    list: base.input(TaskListInput).output(z.array(Task)),
    get: base.input(z.object({ id: TaskId })).output(Task),
    create: base.input(TaskCreateInput).output(Task),
    edit: base.input(TaskEditInput).output(Task),
    assign: base.input(TaskAssignInput).output(Task),
    transition: base.input(TaskTransitionInput).output(Task),
    setArtifacts: base.input(TaskArtifactsInput).output(Task),
  },
  chat: {
    history: base.input(ChatHistoryInput).output(z.array(ChatMessage)),
    send: base
      .input(ChatSendInput)
      .output(z.object({ message: ChatMessage, task: Task.nullable() })),
  },
  sessions: {
    list: base.input(SessionListInput).output(z.array(Session)),
    /** Live, provider-agnostic runtime events of one or all sessions (not persisted). */
    stream: base.input(SessionStreamInput).output(eventIterator(LiveEvent)),
  },
  usage: {
    summary: base.input(UsageSummaryInput).output(UsageSummary),
  },
  resources: {
    inventory: base.output(ResourceInventory),
  },
  secrets: {
    status: base.output(z.object({ present: z.array(SecretKeyName) })),
    set: base
      .input(z.object({ key: SecretKeyName, value: z.string().min(1) }))
      .output(z.object({ key: SecretKeyName })),
    delete: base.input(z.object({ key: SecretKeyName })).output(z.object({ key: SecretKeyName })),
  },
  mail: {
    list: base.input(z.object({ projectId: ProjectId.optional() })).output(z.array(MailItem)),
  },
  intake: {
    /** Polls the enabled connectors now (one project or all); returns what arrived. */
    poll: base
      .input(z.object({ projectId: ProjectId.optional() }))
      .output(z.array(IntakePollResult)),
    status: base.output(z.array(IntakeStatus)),
  },
  events: {
    /** Replays stored events after `afterSeq`, then stays open for live events. */
    subscribe: base.input(EventsSubscribeInput).output(eventIterator(StoredEvent)),
    /** Sequence number of the newest stored event (-1 when the log is empty). */
    head: base.output(z.object({ seq: z.int().min(-1) })),
  },
  office: {
    /**
     * Long-lived stream an office UI keeps open while it is showing the simulation. While at least one
     * viewer is present, handoffs wait for `handoffDelivered` (bounded by a timeout) before the
     * recipient's session starts, so the walk and the handover are visible.
     */
    presence: base.output(eventIterator(z.object({ at: IsoDateTime }))),
    handoffDelivered: base
      .input(z.object({ taskId: TaskId }))
      .output(z.object({ ok: z.literal(true) })),
    /** The courier handed the mail to the boss; the triage session may start. */
    mailDelivered: base
      .input(z.object({ taskId: TaskId }))
      .output(z.object({ ok: z.literal(true) })),
  },
};
export type Contract = typeof contract;
