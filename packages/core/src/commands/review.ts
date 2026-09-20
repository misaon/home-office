import {
  formatReviewNote,
  type Agent,
  type AgentRole,
  compact,
  conflict,
  type HoReportInput,
  type HoReviewInput,
  type NewEvent,
  REVIEW_STAGES,
  ROLE_TITLE,
  type Task,
  type TaskId,
  type TaskWaiveReviewInput,
} from "@ho/protocol";
import { awaitsAnswer, membersOf } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { missingReviewReason, reviewPlanOf } from "./review-plan.ts";
import { handoffEvent, note, noteEvent, statusChange, withTask } from "./shared.ts";
import { readTask } from "./tasks.ts";

const REVIEW_ROLES: ReadonlySet<AgentRole> = new Set(REVIEW_STAGES);

export const isLastReviewerOfStage = (model: ReadModel, agent: Agent): boolean =>
  REVIEW_ROLES.has(agent.role) &&
  membersOf(model, agent.projectId).filter((member) => member.role === agent.role).length === 1;

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

const intoReview = (
  model: ReadModel,
  ctx: CommandContext,
  task: Task,
  from: Agent["id"] | undefined,
  nobody: string,
): NewEvent[] => {
  const plan = reviewPlanOf(model, task);
  if (plan.missing.length > 0) {
    return [statusChange(ctx, task, "blocked", missingReviewReason(plan.missing))];
  }
  const [first] = plan.chain;
  return first === undefined
    ? [statusChange(ctx, task, "done", nobody)]
    : [...forwardTo(ctx, task, from, first), statusChange(ctx, task, "review", "awaiting review")];
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
    if (input.status !== "review" || task.kind !== "work") {
      events.push(statusChange(ctx, task, "done", "reported"));
      return ok({ events, read });
    }
    events.push(
      ...intoReview(model, ctx, task, task.assigneeId, "reported; this task asks for no review"),
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
    const { commit } = task.artifacts;
    const events: NewEvent[] = [
      noteEvent(ctx, task, {
        ...note(ctx, "review", formatReviewNote(input.verdict, input.findings)),
        ...compact({ commit }),
      }),
      {
        type: "task.review_recorded",
        actor: ctx.actor,
        payload: { taskId: task.id, verdict: input.verdict, rounds, ...compact({ commit }) },
      },
    ];
    const read = readTask(task.id);
    if (input.verdict === "approve") {
      const plan = reviewPlanOf(model, task);
      if (plan.missing.length > 0) {
        events.push(statusChange(ctx, task, "blocked", missingReviewReason(plan.missing)));
        return ok({ events, read });
      }
      const position = plan.chain.findIndex((agent) => agent.id === task.reviewerId);
      const next = position === -1 ? undefined : plan.chain[position + 1];
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

export function waiveReview(
  model: ReadModel,
  input: TaskWaiveReviewInput,
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, input.id, (task) => {
    if (ctx.actor.kind !== "human") {
      return err(conflict("only the human waives a review"));
    }
    if (task.kind !== "work") {
      return err(conflict(`a ${task.kind} task has no review to waive`));
    }
    if (!task.reviews[input.stage]) {
      return err(conflict(`this task does not ask for a ${ROLE_TITLE[input.stage]} review`));
    }
    const reason = input.reason?.trim();
    const explained = reason === undefined || reason === "" ? "" : `: ${reason}`;
    const events: NewEvent[] = [
      {
        type: "task.review_waived",
        actor: ctx.actor,
        payload: { taskId: task.id, stage: input.stage, ...compact({ reason }) },
      },
      noteEvent(
        ctx,
        task,
        note(ctx, "info", `review by ${ROLE_TITLE[input.stage]} waived by the human${explained}`),
      ),
    ];
    const waived: Task = { ...task, reviews: { ...task.reviews, [input.stage]: false } };
    if (task.status === "blocked" && task.artifacts.commit !== undefined && !awaitsAnswer(task)) {
      const plan = reviewPlanOf(model, waived);
      if (plan.missing.length === 0) {
        events.push(
          ...intoReview(
            model,
            ctx,
            waived,
            task.assigneeId,
            "approved without review: every stage was waived",
          ),
        );
      }
    }
    return ok({ events, read: readTask(task.id) });
  });
}
