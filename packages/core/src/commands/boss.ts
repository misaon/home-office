import {
  type Agent,
  type AgentId,
  type ChatMessage,
  type HoDelegateInput,
  IntakePolicy,
  type NewEvent,
  type Project,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import { titleFromText } from "./chat.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { bossAgent, findAgentByRef, findProjectByRef, note, officeProject } from "./shared.ts";

/** The boss creates work for the team (source: delegation). Only the boss delegates. */
export function delegateTask(
  model: ReadModel,
  input: HoDelegateInput,
  parentTaskId: TaskId | undefined,
  ctx: CommandContext,
): CommandResult<Task> {
  const boss = ctx.actor.kind === "agent" ? model.agents.get(ctx.actor.agentId) : undefined;
  if (boss?.role !== "boss") {
    return err(conflict("only the boss delegates tasks"));
  }
  const project = findProjectByRef(model, input.project);
  if (project === undefined) {
    return err(notFound("project", input.project));
  }
  if (project.repo.kind === "none") {
    return err(conflict("work tasks need a project with a repository"));
  }
  let assignee: Agent | undefined;
  if (input.assignee !== undefined) {
    assignee = findAgentByRef(model, input.assignee);
    if (assignee === undefined) {
      return err(notFound("agent", input.assignee));
    }
    if (!assignee.projectIds.includes(project.id)) {
      return err(conflict(`${assignee.name} is not a member of ${project.name}`));
    }
  }
  const task: Task = {
    id: ctx.ids.task(),
    projectId: project.id,
    ...(parentTaskId === undefined ? {} : { parentId: parentTaskId }),
    kind: "work",
    title: input.title,
    brief: input.brief,
    status: assignee === undefined ? "inbox" : "assigned",
    ...(assignee === undefined ? {} : { assigneeId: assignee.id }),
    reviewRounds: 0,
    notes: [],
    source: {
      kind: "delegation",
      byAgentId: boss.id,
      ...(parentTaskId === undefined ? {} : { parentTaskId }),
    },
    artifacts: {},
    priority: input.priority ?? "normal",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const handoffNote =
    assignee === undefined
      ? null
      : note(ctx, "handoff", `delegated by ${boss.name}: ${input.brief}`.slice(0, 8000));
  const delegated: Task = handoffNote === null ? task : { ...task, notes: [handoffNote] };
  return ok({
    events: [
      { type: "task.created", actor: ctx.actor, payload: { task: delegated } },
      ...(assignee === undefined || handoffNote === null
        ? []
        : [
            {
              type: "handoff.requested" as const,
              actor: ctx.actor,
              payload: {
                taskId: task.id,
                fromAgentId: boss.id,
                toAgentId: assignee.id,
                brief: handoffNote.text,
              },
            },
          ]),
    ],
    value: delegated,
  });
}

/** A chat message from the human that nobody addressed to a project becomes a triage task for the boss. */
export function triageMessage(
  model: ReadModel,
  text: string,
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  const office = officeProject(model);
  const boss = bossAgent(model);
  const messageId = ctx.ids.chatMessage();
  let task: Task | null = null;
  if (office !== undefined && boss !== undefined) {
    task = {
      id: ctx.ids.task(),
      projectId: office.id,
      kind: "triage",
      title: titleFromText(text),
      brief: text,
      status: "assigned",
      assigneeId: boss.id,
      reviewRounds: 0,
      notes: [],
      source: { kind: "chat", messageId },
      artifacts: {},
      priority: "normal",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
  }
  const message: ChatMessage = {
    id: messageId,
    author: { kind: "human" },
    text,
    ...(task === null ? {} : { taskId: task.id }),
    at: ctx.now,
  };
  const events: NewEvent[] = [
    { type: "chat.message_posted", actor: ctx.actor, payload: { message, author: message.author } },
  ];
  if (task !== null) {
    events.push({ type: "task.created", actor: ctx.actor, payload: { task } });
  }
  return ok({ events, value: { message, task } });
}

/** An agent (usually the boss) speaks in the office chat. */
export function postAgentMessage(
  model: ReadModel,
  agentId: AgentId,
  text: string,
  taskId: TaskId | undefined,
  ctx: CommandContext,
): CommandResult<ChatMessage> {
  if (!model.agents.has(agentId)) {
    return err(notFound("agent", agentId));
  }
  const message: ChatMessage = {
    id: ctx.ids.chatMessage(),
    author: { kind: "agent", agentId },
    text,
    ...(taskId === undefined ? {} : { taskId }),
    at: ctx.now,
  };
  return ok({
    events: [
      {
        type: "chat.message_posted",
        actor: ctx.actor,
        payload: { message, author: message.author },
      },
    ],
    value: message,
  });
}

/** The Lobby: created once by the daemon so triage tasks have a home. */
export function ensureOfficeProject(model: ReadModel, ctx: CommandContext): CommandResult<Project> {
  const existing = officeProject(model);
  if (existing !== undefined) {
    return ok({ events: [], value: existing });
  }
  const project: Project = {
    id: ctx.ids.project(),
    name: "Office",
    repo: { kind: "none" },
    defaultBranch: "main",
    floorTemplateId: "lobby",
    publish: { mode: "branch", draft: true },
    intake: IntakePolicy.parse({}),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return ok({
    events: [{ type: "project.created", actor: ctx.actor, payload: { project } }],
    value: project,
  });
}
