import type {
  Agent,
  HoReportInput,
  HoReviewInput,
  NewEvent,
  Task,
  TaskId,
  TaskStatus,
} from "@ho/protocol";
import { conflict } from "../errors.ts";
import type { ReadModel } from "../model/read-model.ts";
import { err, ok } from "../result.ts";
import type { CommandContext, CommandResult } from "./context.ts";
import { note, noteEvent, requireTask, statusChange } from "./shared.ts";

/** A reviewer for a project: a member with the reviewer role who is not the author. */
export const reviewerFor = (model: ReadModel, task: Task): Agent | undefined =>
  [...model.agents.values()].find(
    (a) =>
      a.role === "reviewer" && a.id !== task.assigneeId && a.projectIds.includes(task.projectId),
  );

/** Worker (or boss in triage) closes its session: report text + the next status, with automatic review routing. */
export function fileReport(
  model: ReadModel,
  taskId: TaskId,
  input: HoReportInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (task.status !== "in_progress") {
    return err(conflict(`task is ${task.status}; reports are filed while in progress`));
  }
  const report = note(ctx, "report", input.summary);
  const artifacts = { ...task.artifacts, report: input.summary };
  const events: NewEvent[] = [
    noteEvent(ctx, task, report),
    { type: "task.artifacts_changed", actor: ctx.actor, payload: { taskId: task.id, artifacts } },
  ];
  const next: Task = { ...task, artifacts, notes: [...task.notes, report] };
  if (input.status === "blocked") {
    events.push(statusChange(ctx, task, "blocked", input.summary.slice(0, 2000)));
    return ok({ events, value: { ...next, status: "blocked" } });
  }
  const reviewer = task.kind === "work" ? reviewerFor(model, task) : undefined;
  if (reviewer !== undefined) {
    // The author carries the work to the reviewer: a handoff the office animates before the review starts.
    const handoffNote = note(ctx, "handoff", `review requested from ${reviewer.name}`);
    events.push(
      noteEvent(ctx, task, handoffNote),
      {
        type: "task.reviewer_assigned",
        actor: ctx.actor,
        payload: { taskId: task.id, reviewerId: reviewer.id },
      },
      statusChange(ctx, task, "review", "awaiting review"),
    );
    if (task.assigneeId !== undefined && task.assigneeId !== reviewer.id) {
      events.push({
        type: "handoff.requested",
        actor: ctx.actor,
        payload: {
          taskId: task.id,
          fromAgentId: task.assigneeId,
          toAgentId: reviewer.id,
          brief: handoffNote.text,
        },
      });
    }
    return ok({
      events,
      value: {
        ...next,
        reviewerId: reviewer.id,
        status: "review",
        notes: [...next.notes, handoffNote],
      },
    });
  }
  const to: TaskStatus = input.status === "done" || task.kind === "triage" ? "done" : "review";
  events.push(statusChange(ctx, task, to, "reported"));
  return ok({ events, value: { ...next, status: to } });
}

/** Reviewer verdict: approve closes the task; request_changes sends it back to the worker or blocks it after the budget. */
export function submitReview(
  model: ReadModel,
  taskId: TaskId,
  input: HoReviewInput,
  ctx: CommandContext,
): CommandResult<Task> {
  const found = requireTask(model, taskId);
  if (!found.ok) {
    return found;
  }
  const task = found.value;
  if (task.status !== "review") {
    return err(conflict(`task is ${task.status}; only tasks in review accept a verdict`));
  }
  const rounds = task.reviewRounds + 1;
  const verdictNote = note(ctx, "review", `${input.verdict}: ${input.findings}`);
  const events: NewEvent[] = [
    noteEvent(ctx, task, verdictNote),
    {
      type: "task.review_recorded",
      actor: ctx.actor,
      payload: { taskId: task.id, verdict: input.verdict, rounds },
    },
  ];
  const base: Task = { ...task, reviewRounds: rounds, notes: [...task.notes, verdictNote] };
  if (input.verdict === "approve") {
    events.push(statusChange(ctx, task, "done", "approved"));
    return ok({ events, value: { ...base, status: "done" } });
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
    return ok({ events, value: { ...base, status: "blocked" } });
  }
  // Changes requested: the reviewer walks the findings back to the author.
  const back = note(
    ctx,
    "handoff",
    `changes requested by ${
      task.reviewerId === undefined
        ? "the reviewer"
        : (model.agents.get(task.reviewerId)?.name ?? "the reviewer")
    }`,
  );
  events.push(noteEvent(ctx, task, back), statusChange(ctx, task, "assigned", "changes requested"));
  if (task.reviewerId !== undefined && task.reviewerId !== worker.id) {
    events.push({
      type: "handoff.requested",
      actor: ctx.actor,
      payload: {
        taskId: task.id,
        fromAgentId: task.reviewerId,
        toAgentId: worker.id,
        brief: back.text,
      },
    });
  }
  return ok({ events, value: { ...base, status: "assigned", notes: [...base.notes, back] } });
}
