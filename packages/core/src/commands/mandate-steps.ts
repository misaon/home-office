import {
  type AgentId,
  clip,
  conflict,
  type Mandate,
  type MandateId,
  type NewEvent,
  notFound,
  type Task,
  type TaskId,
} from "@ho/protocol";
import type { TaskCriteria } from "../mandate-assessment.ts";
import { bossOf, tasksOfMandate } from "../model/queries.ts";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { mandateStatusEvent } from "./mandates.ts";
import { note } from "./shared.ts";
import { newTask, readTask } from "./tasks.ts";

const TITLE_MAX = 200;
const REASON_MAX = 4000;

const withMandate = <T>(
  model: ReadModel,
  mandateId: MandateId,
  then: (mandate: Mandate) => CommandResult<T>,
): CommandResult<T> => {
  const mandate = model.mandates.get(mandateId);
  return mandate === undefined ? err(notFound("mandate", mandateId)) : then(mandate);
};

const numbered = (items: readonly string[]): string =>
  items.map((text, index) => `${String(index + 1)}. ${text}`).join("\n");

const taskLines = (model: ReadModel, tasks: readonly Task[]): string =>
  tasks
    .map((task) => {
      const who = task.assigneeId === undefined ? undefined : model.agents.get(task.assigneeId);
      return `- ${task.id} "${task.title}" by ${who?.name ?? "a former colleague"}: ${task.artifacts.branch ?? "no branch"} at ${task.artifacts.commit ?? "no commit"}`;
    })
    .join("\n");

const unverifiedLines = (taskCriteria: readonly TaskCriteria[]): string =>
  taskCriteria
    .map(
      ({ task, indexes }) =>
        `- ${task.id} "${task.title}": ${indexes
          .map(
            (index) =>
              `${String(index + 1)}. ${task.spec?.acceptanceCriteria[index] ?? "(missing)"}`,
          )
          .join("; ")}`,
    )
    .join("\n");

export type VerificationScope = { criteria: number[]; taskCriteria: TaskCriteria[] };

const verifyBrief = (model: ReadModel, mandate: Mandate, scope: VerificationScope): string => {
  const done = tasksOfMandate(model, mandate).filter(
    (task) => task.kind === "work" && task.status === "done",
  );
  return [
    `Verify the whole request "${mandate.title}" on its integrated result: branch ${mandate.artifacts.branch ?? "?"}, commit ${mandate.artifacts.commit ?? "?"}.`,
    `Request, as the human wrote it:\n${mandate.request}`,
    `Conditions of done, by number:\n${numbered(mandate.acceptance.map((criterion) => criterion.text))}`,
    `Tasks that make up the result:\n${taskLines(model, done)}`,
    scope.taskCriteria.length === 0
      ? ""
      : `Task criteria without independent evidence yet; judge them too, in taskCriteria with the task id:\n${unverifiedLines(scope.taskCriteria)}`,
    mandate.round === 0
      ? ""
      : `This is fix round ${String(mandate.round)}: the earlier verification failed and the work was redone, so check the earlier failures with particular care.`,
  ]
    .filter((part) => part !== "")
    .join("\n\n");
};

export function openVerification(
  model: ReadModel,
  mandateId: MandateId,
  input: { verifierId: AgentId; browser: boolean; scope: VerificationScope },
  ctx: CommandContext,
): CommandResult<Task> {
  return withMandate(model, mandateId, (mandate) => {
    const { branch, commit } = mandate.artifacts;
    if (branch === undefined || commit === undefined) {
      return err(conflict("the request has no integrated commit to verify yet"));
    }
    const verifier = model.agents.get(input.verifierId);
    if (verifier === undefined) {
      return err(notFound("agent", input.verifierId));
    }
    const task = newTask(ctx, {
      projectId: mandate.projectId,
      mandateId,
      kind: "verify",
      title: `Verify: ${mandate.title}`.slice(0, TITLE_MAX),
      brief: verifyBrief(model, mandate, input.scope),
      source: { kind: "mandate", mandateId },
      assigneeId: verifier.id,
      browser: input.browser ? true : undefined,
      artifacts: { branch, commit },
      notes: [note(ctx, "handoff", "verification of the whole request requested by the office")],
    });
    const events: NewEvent[] = [
      { type: "task.created", actor: ctx.actor, payload: { task } },
      mandateStatusEvent(
        ctx,
        mandate,
        "verifying",
        `${verifier.name} verifies the integrated result against ${String(mandate.acceptance.length)} condition(s)`,
      ),
    ];
    return ok({ events, read: readTask(task.id) });
  });
}

export function openFixTask(
  model: ReadModel,
  mandateId: MandateId,
  input: { originalId: TaskId; reason: string },
  ctx: CommandContext,
): CommandResult<Task> {
  return withMandate(model, mandateId, (mandate) => {
    const original = model.tasks.get(input.originalId);
    if (original === undefined) {
      return err(notFound("task", input.originalId));
    }
    if (original.assigneeId === undefined) {
      return err(conflict(`"${original.title}" has no author to fix it`));
    }
    const reason = clip(input.reason, REASON_MAX);
    const task = newTask(ctx, {
      projectId: mandate.projectId,
      mandateId,
      kind: "work",
      title: `Fix: ${original.title}`.slice(0, TITLE_MAX),
      brief: `${original.brief}\n\nVerification round ${String(mandate.round)} of the request "${mandate.title}" failed on the integrated result:\n${reason}\n\nYour branch already contains "${original.title}"; fix what failed on top of it, keep every acceptance criterion holding, and report again.`,
      spec: original.spec,
      source: { kind: "mandate", mandateId },
      assigneeId: original.assigneeId,
      priority: original.priority,
      shape: original.shape,
      publish: original.publish,
      browser: original.browser,
      reviews: original.reviews,
      dependsOn: [original.id],
      notes: [note(ctx, "handoff", `fix requested by the office after verification: ${reason}`)],
    });
    return ok({
      events: [{ type: "task.created", actor: ctx.actor, payload: { task } }],
      read: readTask(task.id),
    });
  });
}

export function openDecision(
  model: ReadModel,
  mandateId: MandateId,
  input: { brief: string },
  ctx: CommandContext,
): CommandResult<Task> {
  return withMandate(model, mandateId, (mandate) => {
    const boss = bossOf(model, mandate.projectId);
    if (boss === undefined) {
      return err(conflict("this floor has no boss to decide how the request continues"));
    }
    const task = newTask(ctx, {
      projectId: mandate.projectId,
      mandateId,
      kind: "triage",
      title: `Decide: ${mandate.title}`.slice(0, TITLE_MAX),
      brief: input.brief,
      source: { kind: "mandate", mandateId },
      assigneeId: boss.id,
    });
    return ok({
      events: [{ type: "task.created", actor: ctx.actor, payload: { task } }],
      read: readTask(task.id),
    });
  });
}
