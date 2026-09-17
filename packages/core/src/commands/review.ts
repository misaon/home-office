import {
  type Agent,
  conflict,
  type HoReportInput,
  type HoReviewInput,
  type NewEvent,
  REVIEW_STAGES,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { membersOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { handoffEvent, note, noteEvent, statusChange, withTask } from "./shared.ts";
import { readTask } from "./tasks.ts";

export const reviewChain = (model: ReadModel, task: Task): Agent[] => {
  const members = membersOf(model, task.projectId);
  return REVIEW_STAGES.filter((stage) => (stage === "head" ? true : task.reviews[stage])).flatMap(
    (stage) => {
      const reviewer = members.find(
        (agent) => agent.role === stage && agent.id !== task.assigneeId,
      );
      return reviewer === undefined ? [] : [reviewer];
    },
  );
};

const forwardTo = (
  ctx: CommandContext,
  task: Task,
  from: Agent["id"] | undefined,
  reviewer: Agent,
): NewEvent[] => {
  const handoffNote = note(ctx, "handoff", `review requested from ${reviewer.name}`);
  const events: NewEvent[] = [
    noteEvent(ctx, task, handoffNote),
    {
      type: "task.reviewer_assigned",
      actor: ctx.actor,
      payload: { taskId: task.id, reviewerId: reviewer.id },
    },
  ];
  if (from !== undefined && from !== reviewer.id) {
    events.push(handoffEvent(ctx, task.id, from, reviewer.id, handoffNote.text));
  }
  return events;
};

export function fileReport(
  model: ReadModel,
  taskId: TaskId,
  input: HoReportInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) => {
    if (task.status !== "in_progress") {
      return err(conflict(`task is ${task.status}; reports are filed while in progress`));
    }
    const events: NewEvent[] = [
      noteEvent(ctx, task, note(ctx, "report", input.summary)),
      {
        type: "task.artifacts_changed",
        actor: ctx.actor,
        payload: { taskId: task.id, artifacts: { ...task.artifacts, report: input.summary } },
      },
    ];
    const read = readTask(task.id);
    if (input.status === "blocked") {
      events.push(statusChange(ctx, task, "blocked", input.summary.slice(0, 2000)));
      return ok({ events, read });
    }
    const [first] =
      input.status === "review" && task.kind === "work" ? reviewChain(model, task) : [];
    if (first === undefined) {
      events.push(
        statusChange(
          ctx,
          task,
          "done",
          input.status === "review" && task.kind === "work"
            ? "reported; no reviewer in this project"
            : "reported",
        ),
      );
      return ok({ events, read });
    }
    events.push(
      ...forwardTo(ctx, task, task.assigneeId, first),
      statusChange(ctx, task, "review", "awaiting review"),
    );
    return ok({ events, read });
  });
}

export function submitReview(
  model: ReadModel,
  taskId: TaskId,
  input: HoReviewInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) => {
    if (task.status !== "review") {
      return err(conflict(`task is ${task.status}; only tasks in review accept a verdict`));
    }
    const rounds = input.verdict === "approve" ? task.reviewRounds : task.reviewRounds + 1;
    const events: NewEvent[] = [
      noteEvent(ctx, task, note(ctx, "review", `${input.verdict}: ${input.findings}`)),
      {
        type: "task.review_recorded",
        actor: ctx.actor,
        payload: { taskId: task.id, verdict: input.verdict, rounds },
      },
    ];
    const read = readTask(task.id);
    if (input.verdict === "approve") {
      const chain = reviewChain(model, task);
      const position = chain.findIndex((agent) => agent.id === task.reviewerId);
      const next = position === -1 ? undefined : chain[position + 1];
      if (next === undefined) {
        events.push(statusChange(ctx, task, "done", "approved"));
      } else {
        events.push(...forwardTo(ctx, task, task.reviewerId, next));
      }
      return ok({ events, read });
    }
    const worker = task.assigneeId === undefined ? undefined : model.agents.get(task.assigneeId);
    const limit = worker?.budgets.maxReviewRounds ?? 0;
    if (worker === undefined || rounds > limit) {
      events.push(
        statusChange(
          ctx,
          task,
          "blocked",
          `review round budget exhausted (${String(rounds)}/${String(limit)})`,
        ),
      );
      return ok({ events, read });
    }
    const reviewerName =
      task.reviewerId === undefined
        ? "the reviewer"
        : (model.agents.get(task.reviewerId)?.name ?? "the reviewer");
    const back = note(ctx, "handoff", `changes requested by ${reviewerName}`);
    events.push(
      noteEvent(ctx, task, back),
      statusChange(ctx, task, "assigned", "changes requested"),
    );
    if (task.reviewerId !== undefined && task.reviewerId !== worker.id) {
      events.push(handoffEvent(ctx, task.id, task.reviewerId, worker.id, back.text));
    }
    return ok({ events, read });
  });
}
