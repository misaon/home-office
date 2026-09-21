import {
  clip,
  type CommitSha,
  compact,
  type EvidenceVerdict,
  type NewEvent,
  NOTE_MAX,
  PROOF_MAX,
  type Task,
  type TaskId,
  type TaskNote,
  type TaskStatus,
  VERIFY_NOTE_PREFIX,
} from "@ho/protocol";
import type { ReadModel } from "../model/read-model.ts";
import { type CommandContext, type CommandResult, err, ok } from "../result.ts";
import { evidenceEvent, evidenceOf } from "./mandates.ts";
import { note, noteEvent, statusChange, withTask } from "./shared.ts";
import { canTransition, readTask } from "./tasks.ts";

export const verifyAttempts = (task: Task): number =>
  task.notes.filter((n) => n.author.kind === "system" && n.text.startsWith(VERIFY_NOTE_PREFIX))
    .length;

const checksEvidence = (
  model: ReadModel,
  ctx: CommandContext,
  task: Task,
  commit: CommitSha | undefined,
  verdict: EvidenceVerdict,
  proof: string,
): NewEvent[] =>
  task.mandateId === undefined || commit === undefined || !model.mandates.has(task.mandateId)
    ? []
    : [
        evidenceEvent(
          ctx,
          task.mandateId,
          evidenceOf(ctx, {
            taskId: task.id,
            commit,
            criterion: null,
            method: "checks",
            verdict,
            proof: clip(proof, PROOF_MAX),
          }),
        ),
      ];

export function recordChecksPassed(
  model: ReadModel,
  taskId: TaskId,
  detail: { command: string; commit: CommitSha; ms: number },
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) =>
    ok({
      events: checksEvidence(
        model,
        ctx,
        task,
        detail.commit,
        "pass",
        `\`${detail.command}\` passed in ${String(Math.round(detail.ms / 1000))} s`,
      ),
      read: readTask(task.id),
    }),
  );
}

export function annotateTask(
  model: ReadModel,
  taskId: TaskId,
  entry: { kind: TaskNote["kind"]; text: string; commit?: CommitSha },
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) =>
    ok({
      events: [
        noteEvent(ctx, task, {
          ...note(ctx, entry.kind, entry.text.slice(0, NOTE_MAX)),
          ...compact({ commit: entry.commit }),
        }),
      ],
      read: readTask(task.id),
    }),
  );
}

export function recordVerificationFailure(
  model: ReadModel,
  taskId: TaskId,
  detail: { command: string; output: string; maxAttempts: number; commit?: CommitSha },
  ctx: CommandContext,
): CommandResult<Task> {
  return withTask(model, taskId, (task) => {
    const spent = verifyAttempts(task) + 1 >= detail.maxAttempts;
    const to: TaskStatus = spent || task.assigneeId === undefined ? "blocked" : "assigned";
    if (!canTransition(task.status, to)) {
      return err({ code: "invalid_transition", from: task.status, to });
    }
    const text = `${VERIFY_NOTE_PREFIX} \`${detail.command}\`\n\n${detail.output}`.slice(
      0,
      NOTE_MAX,
    );
    return ok({
      events: [
        ...checksEvidence(
          model,
          ctx,
          task,
          detail.commit,
          "fail",
          `\`${detail.command}\` failed:\n${detail.output}`,
        ),
        noteEvent(ctx, task, {
          ...note(ctx, "review", text),
          ...compact({ commit: detail.commit }),
        }),
        statusChange(
          ctx,
          task,
          to,
          spent
            ? `checks still failing after ${String(detail.maxAttempts)} attempt(s)`
            : "checks failed",
        ),
      ],
      read: readTask(task.id),
    });
  });
}
