import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import {
  Agent,
  ChatMessage,
  IsoDateTime,
  MailItem,
  Project,
  Session,
  Task,
  TaskStatus,
} from "./domain.ts";
import { StoredEvent } from "./events.ts";
import { IntakePollResult, IntakeStatus } from "./intake.ts";
import { SecretKeyName } from "./providers.ts";
import { AgentId, ProjectId, TaskId } from "./ids.ts";
import { Doctor, LiveEvent, ResourceInventory } from "./runtime-events.ts";
import {
  AgentCopyInput,
  AgentCreateInput,
  AgentListInput,
  AgentUpdateInput,
  ChatHistoryInput,
  ChatSendInput,
  EventsSubscribeInput,
  Health,
  ProjectCreateInput,
  ProjectUpdateInput,
  RepoInspectInput,
  RepoInspection,
  SessionListInput,
  SessionStreamInput,
  TaskArtifactsInput,
  TaskAssignInput,
  TaskCreateInput,
  TaskEditInput,
  TaskListInput,
  TaskTransitionInput,
  UsageSummary,
  UsageSummaryInput,
} from "./inputs.ts";

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
    /** Checks a repository before it becomes a floor: is it git, what is it called, which branch is its default. */
    inspect: base.input(RepoInspectInput).output(RepoInspection),
    create: base.input(ProjectCreateInput).output(Project),
    update: base.input(ProjectUpdateInput).output(Project),
    remove: base.input(z.object({ id: ProjectId })).output(z.object({ id: ProjectId })),
  },
  agents: {
    list: base.input(AgentListInput).output(z.array(Agent)),
    create: base.input(AgentCreateInput).output(Agent),
    update: base.input(AgentUpdateInput).output(Agent),
    copy: base.input(AgentCopyInput).output(Agent),
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
     * viewer is present, the daemon waits for `delivered` (bounded by a timeout) before it acts on an envelope:
     * the recipient's session of a handoff, the boss's triage of a chat message or mail Lola carries to him,
     * the boss's status post when finished work walks back to him.
     */
    presence: base.output(eventIterator(z.object({ at: IsoDateTime }))),
    /** The envelope for this task reached its recipient in the animation. */
    delivered: base.input(z.object({ taskId: TaskId })).output(z.object({ ok: z.literal(true) })),
  },
};
export type Contract = typeof contract;
