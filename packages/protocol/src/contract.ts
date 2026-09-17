import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import { Agent, ChatMessage, IsoDateTime, MailItem, Project, Session, Task } from "./domain.ts";
import { RPC_ERRORS } from "./errors.ts";
import { StoredEvent } from "./events.ts";
import { IntakePollResult, IntakeStatus } from "./intake.ts";
import { OfficeFileExport, OfficeFileSync } from "./office-file.ts";
import { LayoutSaved, LayoutStore, OfficeLayout } from "./office-layout.ts";
import { SecretKeyName } from "./providers.ts";
import { AgentId, ProjectId, SessionId, TaskId } from "./ids.ts";
import { Doctor, LiveEvent, ResourceInventory } from "./runtime-events.ts";
import {
  AgentCopyInput,
  AgentCreateInput,
  AgentListInput,
  AgentUpdateInput,
  ChatClearInput,
  ChatSendInput,
  DirectoryPick,
  DirectoryPickInput,
  EventsSubscribeInput,
  Health,
  ProjectCreateInput,
  ProjectUpdateInput,
  RepoInspectInput,
  RepoInspection,
  SessionListInput,
  SessionStreamInput,
  TaskAssignInput,
  TaskCreateInput,
  TaskListInput,
  TaskRateInput,
  TaskTransitionInput,
  UsageSummary,
  UsageSummaryInput,
} from "./inputs.ts";

const base = oc.errors(RPC_ERRORS);

export const contract = {
  system: {
    health: base.output(Health),
    doctor: base.output(Doctor),
    buildImages: base.output(eventIterator(z.object({ line: z.string() }))),
    pickDirectory: base.input(DirectoryPickInput).output(DirectoryPick),
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
    inspect: base.input(RepoInspectInput).output(RepoInspection),
    create: base.input(ProjectCreateInput).output(Project),
    update: base.input(ProjectUpdateInput).output(Project),
    remove: base.input(z.object({ id: ProjectId })).output(z.object({ id: ProjectId })),
    sync: base
      .input(z.object({ id: ProjectId, dryRun: z.boolean().default(false) }))
      .output(OfficeFileSync),
    export: base.input(z.object({ id: ProjectId })).output(OfficeFileExport),
  },
  layouts: {
    list: base.output(LayoutStore),
    save: base.input(OfficeLayout).output(LayoutSaved),
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
    assign: base.input(TaskAssignInput).output(Task),
    transition: base.input(TaskTransitionInput).output(Task),
    rate: base.input(TaskRateInput).output(Task),
    remove: base.input(z.object({ id: TaskId })).output(z.object({ id: TaskId })),
    publish: base
      .input(z.object({ id: TaskId }))
      .output(z.object({ branch: z.string(), prUrl: z.string().nullable() })),
    clear: base
      .input(z.object({ projectId: ProjectId }))
      .output(z.object({ removed: z.int().nonnegative() })),
  },
  chat: {
    send: base
      .input(ChatSendInput)
      .output(z.object({ message: ChatMessage, task: Task.nullable() })),
    clear: base.input(ChatClearInput).output(z.object({ removed: z.int().nonnegative() })),
  },
  sessions: {
    list: base.input(SessionListInput).output(z.array(Session)),
    stream: base.input(SessionStreamInput).output(eventIterator(LiveEvent)),
    stop: base.input(z.object({ id: SessionId })).output(z.object({ stopped: z.boolean() })),
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
    poll: base
      .input(z.object({ projectId: ProjectId.optional() }))
      .output(z.array(IntakePollResult)),
    status: base.output(z.array(IntakeStatus)),
  },
  events: {
    subscribe: base.input(EventsSubscribeInput).output(eventIterator(StoredEvent)),
    head: base.output(
      z.object({
        seq: z.int().min(-1),
        logId: z.string().nullable(),
      }),
    ),
  },
  office: {
    presence: base.output(eventIterator(z.object({ at: IsoDateTime }))),
    delivered: base.input(z.object({ taskId: TaskId })).output(z.object({ ok: z.literal(true) })),
  },
};
export type Contract = typeof contract;

export const TOKEN_STORAGE_KEY = "ho.token";
