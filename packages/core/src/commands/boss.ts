import {
  type AgentId,
  type Attachment,
  type ChatMessage,
  type ChatThreadId,
  type ChatThreadTarget,
  compact,
  conflict,
  type HoDelegateInput,
  type HoPlanInput,
  type NewEvent,
  notFound,
  NOTE_MAX,
  type ProjectId,
  type Task,
  type TaskId,
  type TaskSpec,
} from "@ho/protocol";
import { bossOf, findAgentByRef, latestThread, membersOf, threadOfTask } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { attachToMandate } from "./mandate-open.ts";
import { chatEvent, handoffEvent, note, titleFromText, withAgent, withProject } from "./shared.ts";
import { checkDependencies, checkReviewers } from "./task-checks.ts";
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
  const delegator = ctx.actor.kind === "agent" ? model.agents.get(ctx.actor.agentId) : undefined;
  if (delegator === undefined || (delegator.role !== "boss" && delegator.role !== "analyst")) {
    return err(conflict("only the boss and the analyst delegate tasks"));
  }
  return withProject(model, delegator.projectId, (project) => {
    const assignee =
      input.assignee === undefined ? undefined : findAgentByRef(model, input.assignee, project.id);
    if (input.assignee !== undefined && assignee === undefined) {
      return err(notFound("agent", `${input.assignee} (on floor "${project.name}")`));
    }
    const reviews = { qa: input.qa, security: input.security, head: true };
    const reviewers = checkReviewers(model, {
      projectId: project.id,
      reviews,
      assigneeId: assignee?.id,
    });
    if (!reviewers.ok) {
      return reviewers;
    }
    const dependencies = checkDependencies(model, project.id, input.dependsOn);
    if (!dependencies.ok) {
      return dependencies;
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
        : note(ctx, "handoff", `delegated by ${delegator.name}: ${brief}`.slice(0, NOTE_MAX));
    const attached = attachToMandate(model, ctx, parentTaskId);
    const task = newTask(ctx, {
      projectId: project.id,
      mandateId: attached.mandateId,
      kind: "work",
      title: input.title,
      brief,
      spec,
      source: { kind: "delegation", byAgentId: delegator.id, parentTaskId },
      assigneeId: assignee?.id,
      priority: input.priority,
      publish: input.publish,
      browser: input.browser,
      reviews,
      dependsOn: dependencies.value,
      notes: handoffNote === undefined ? [] : [handoffNote],
    });
    const events: NewEvent[] = [
      ...attached.events,
      { type: "task.created", actor: ctx.actor, payload: { task } },
    ];
    if (assignee !== undefined && handoffNote !== undefined) {
      events.push(handoffEvent(ctx, task.id, delegator.id, assignee.id, handoffNote.text));
    }
    return ok({ events, read: readTask(task.id) });
  });
}

export function planTask(
  model: ReadModel,
  input: HoPlanInput,
  parentTaskId: TaskId | undefined,
  ctx: CommandContext,
): CommandResult<Task> {
  const boss = ctx.actor.kind === "agent" ? model.agents.get(ctx.actor.agentId) : undefined;
  if (boss?.role !== "boss") {
    return err(conflict("only the boss hands requests to the analyst"));
  }
  return withProject(model, boss.projectId, (project) => {
    const analyst =
      input.assignee === undefined
        ? membersOf(model, project.id).find((agent) => agent.role === "analyst")
        : findAgentByRef(model, input.assignee, project.id);
    if (analyst === undefined) {
      return err(
        input.assignee === undefined
          ? conflict("this floor has no analyst; specify the work yourself with ho_delegate")
          : notFound("agent", `${input.assignee} (on floor "${project.name}")`),
      );
    }
    if (analyst.id === boss.id) {
      return err(
        conflict("a plan goes to a colleague; specify the work yourself with ho_delegate"),
      );
    }
    const context = input.context.trim();
    const handoffNote = note(ctx, "handoff", `planning requested by ${boss.name}: ${input.title}`);
    const attached = attachToMandate(model, ctx, parentTaskId);
    const task = newTask(ctx, {
      projectId: project.id,
      mandateId: attached.mandateId,
      kind: "plan",
      title: input.title,
      brief: context === "" ? input.brief : `${input.brief}\n\nContext:\n${context}`,
      source: { kind: "delegation", byAgentId: boss.id, parentTaskId },
      assigneeId: analyst.id,
      priority: input.priority,
      notes: [handoffNote],
    });
    return ok({
      events: [
        ...attached.events,
        { type: "task.created", actor: ctx.actor, payload: { task } },
        handoffEvent(ctx, task.id, boss.id, analyst.id, handoffNote.text),
      ],
      read: readTask(task.id),
    });
  });
}

const resolveThread = (
  model: ReadModel,
  projectId: ProjectId,
  target: ChatThreadTarget,
  ctx: CommandContext,
): ChatThreadId => {
  if (target.kind === "thread") {
    return target.id;
  }
  if (target.kind === "new") {
    return ctx.ids.chatThread();
  }
  return latestThread(model, projectId) ?? ctx.ids.chatThread();
};

export function triageMessage(
  model: ReadModel,
  projectId: ProjectId,
  text: string,
  attachments: readonly Attachment[],
  target: ChatThreadTarget,
  ctx: CommandContext,
): CommandResult<{ message: ChatMessage; task: Task | null }> {
  return withProject(model, projectId, () => {
    const boss = bossOf(model, projectId);
    const messageId = ctx.ids.chatMessage();
    const threadId = resolveThread(model, projectId, target, ctx);
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
      threadId,
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
    const task = taskId === undefined ? undefined : model.tasks.get(taskId);
    const message: ChatMessage = {
      id: ctx.ids.chatMessage(),
      projectId: agent.projectId,
      author: { kind: "agent", agentId },
      text,
      attachments: [...attachments],
      ...(taskId === undefined ? {} : { taskId }),
      ...compact({ threadId: task === undefined ? undefined : threadOfTask(model, task) }),
      at: ctx.now,
    };
    return ok({ events: [chatEvent(ctx, message)], read: () => message });
  });
}

export function clearChat(
  model: ReadModel,
  projectId: ProjectId,
  threadId: ChatThreadId | undefined,
  ctx: CommandContext,
): CommandResult<number> {
  return withProject(model, projectId, () => {
    const removed = (model.chat.get(projectId) ?? []).filter(
      (message) => message.threadId === threadId,
    ).length;
    return ok({
      events:
        removed === 0
          ? []
          : [
              {
                type: "chat.cleared",
                actor: ctx.actor,
                payload: { projectId, ...compact({ threadId }) },
              },
            ],
      read: () => removed,
    });
  });
}
