import type {
  Agent,
  AgentId,
  ChatMessage,
  HoDelegateInput,
  NewEvent,
  ProjectId,
  Task,
  TaskId,
} from "@ho/protocol";
import { conflict, notFound } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { bossOf, findAgentByRef, note, titleFromText } from "./shared.ts";

/**
 * The boss creates work for his floor (source: delegation). Only a boss delegates, only within his own
 * project, and only to its members — himself included, which is how a floor without staff gets things done.
 */
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
  const project = model.projects.get(boss.projectId);
  if (project === undefined) {
    return err(notFound("project", boss.projectId));
  }
  let assignee: Agent | undefined;
  if (input.assignee !== undefined) {
    assignee = findAgentByRef(model, input.assignee, project.id);
    if (assignee === undefined) {
      return err(notFound("agent", `${input.assignee} (on floor "${project.name}")`));
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

/**
 * A chat message from the human to a floor: Lola carries it to the floor's boss as a triage task. Without a
 * boss (a floor mid-removal) the message is only recorded.
 */
export function triageMessage(
  model: ReadModel,
  projectId: ProjectId,
  text: string,
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  const project = model.projects.get(projectId);
  if (project === undefined) {
    return err(notFound("project", projectId));
  }
  const boss = bossOf(model, projectId);
  const messageId = ctx.ids.chatMessage();
  let task: Task | null = null;
  if (boss !== undefined) {
    task = {
      id: ctx.ids.task(),
      projectId,
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
    projectId,
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

/** An agent (usually the boss) speaks in his floor's chat. */
export function postAgentMessage(
  model: ReadModel,
  agentId: AgentId,
  text: string,
  taskId: TaskId | undefined,
  ctx: CommandContext,
): CommandResult<ChatMessage> {
  const agent = model.agents.get(agentId);
  if (agent === undefined) {
    return err(notFound("agent", agentId));
  }
  const message: ChatMessage = {
    id: ctx.ids.chatMessage(),
    projectId: agent.projectId,
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
