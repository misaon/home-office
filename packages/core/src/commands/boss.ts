import {
  type AgentId,
  type Attachment,
  type ChatMessage,
  conflict,
  type HoDelegateInput,
  type NewEvent,
  notFound,
  NOTE_MAX,
  type ProjectId,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { bossOf, findAgentByRef } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { chatEvent, handoffEvent, note, titleFromText } from "./shared.ts";
import { newTask, readTask } from "./tasks.ts";

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
  const assignee =
    input.assignee === undefined ? undefined : findAgentByRef(model, input.assignee, project.id);
  if (input.assignee !== undefined && assignee === undefined) {
    return err(notFound("agent", `${input.assignee} (on floor "${project.name}")`));
  }
  const handoffNote =
    assignee === undefined
      ? undefined
      : note(ctx, "handoff", `delegated by ${boss.name}: ${input.brief}`.slice(0, NOTE_MAX));
  const task = newTask(ctx, {
    projectId: project.id,
    kind: "work",
    title: input.title,
    brief: input.brief,
    source: { kind: "delegation", byAgentId: boss.id, parentTaskId },
    assigneeId: assignee?.id,
    priority: input.priority,
    notes: handoffNote === undefined ? [] : [handoffNote],
  });
  const events: NewEvent[] = [{ type: "task.created", actor: ctx.actor, payload: { task } }];
  if (assignee !== undefined && handoffNote !== undefined) {
    events.push(handoffEvent(ctx, task.id, boss.id, assignee.id, handoffNote.text));
  }
  return ok({ events, read: readTask(task.id) });
}

/**
 * A chat message from the human to a floor: Lola carries it to the floor's boss as a triage task. Without a
 * boss (a floor mid-removal) the message is only recorded.
 */
export function triageMessage(
  model: ReadModel,
  projectId: ProjectId,
  text: string,
  attachments: readonly Attachment[],
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  const project = model.projects.get(projectId);
  if (project === undefined) {
    return err(notFound("project", projectId));
  }
  const boss = bossOf(model, projectId);
  const messageId = ctx.ids.chatMessage();
  const task =
    boss === undefined
      ? null
      : newTask(ctx, {
          projectId,
          kind: "triage",
          title: titleFromText(text),
          brief: text,
          source: { kind: "chat", messageId },
          assigneeId: boss.id,
        });
  const message: ChatMessage = {
    id: messageId,
    projectId,
    author: { kind: "human" },
    text,
    attachments: [...attachments],
    ...(task === null ? {} : { taskId: task.id }),
    at: ctx.now,
  };
  const events: NewEvent[] = [chatEvent(ctx, message)];
  if (task !== null) {
    events.push({ type: "task.created", actor: ctx.actor, payload: { task } });
  }
  return ok({
    events,
    read: (m) => ({ message, task: task === null ? null : readTask(task.id)(m) }),
  });
}

/** An agent (usually the boss) speaks in his floor's chat. */
export function postAgentMessage(
  model: ReadModel,
  agentId: AgentId,
  text: string,
  taskId: TaskId | undefined,
  ctx: CommandContext,
  attachments: readonly Attachment[] = [],
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
    attachments: [...attachments],
    ...(taskId === undefined ? {} : { taskId }),
    at: ctx.now,
  };
  return ok({ events: [chatEvent(ctx, message)], read: () => message });
}
