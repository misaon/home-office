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
  type TaskSpec,
} from "@ho/protocol";
import { bossOf, findAgentByRef } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { chatEvent, handoffEvent, note, titleFromText, withAgent, withProject } from "./shared.ts";
import { newTask, readTask } from "./tasks.ts";

const section = (heading: string, lines: readonly string[]): string =>
  lines.length === 0 ? "" : `\n\n${heading}\n${lines.map((l) => `- ${l}`).join("\n")}`;

const renderBrief = (spec: TaskSpec, context: string): string =>
  [
    spec.goal,
    section("Acceptance criteria:", spec.acceptanceCriteria),
    section("Constraints:", spec.constraints),
    section("Out of scope:", spec.outOfScope),
    context.trim() === "" ? "" : `\n\nContext:\n${context.trim()}`,
  ].join("");

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
  return withProject(model, boss.projectId, (project) => {
    const assignee =
      input.assignee === undefined ? undefined : findAgentByRef(model, input.assignee, project.id);
    if (input.assignee !== undefined && assignee === undefined) {
      return err(notFound("agent", `${input.assignee} (on floor "${project.name}")`));
    }
    const spec: TaskSpec = {
      goal: input.goal,
      acceptanceCriteria: input.acceptanceCriteria,
      constraints: input.constraints,
      outOfScope: input.outOfScope,
    };
    const brief = renderBrief(spec, input.context);
    const handoffNote =
      assignee === undefined
        ? undefined
        : note(ctx, "handoff", `delegated by ${boss.name}: ${brief}`.slice(0, NOTE_MAX));
    const task = newTask(ctx, {
      projectId: project.id,
      kind: "work",
      title: input.title,
      brief,
      spec,
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
  });
}

export function triageMessage(
  model: ReadModel,
  projectId: ProjectId,
  text: string,
  attachments: readonly Attachment[],
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  return withProject(model, projectId, () => {
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
  });
}

export function postAgentMessage(
  model: ReadModel,
  agentId: AgentId,
  text: string,
  taskId: TaskId | undefined,
  ctx: CommandContext,
  attachments: readonly Attachment[] = [],
): CommandResult<ChatMessage> {
  return withAgent(model, agentId, (agent) => {
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
  });
}
