import { verifyAttempts } from "@ho/core";
import { addUsage, type Mandate, type ProjectId, type TaskId, ZERO_USAGE } from "@ho/protocol";
import { z } from "zod";
import type { Office } from "./client.ts";

export const Outcome = z.enum([
  "fulfilled",
  "blocked",
  "abandoned",
  "answered",
  "timeout",
  "no_boss",
]);
export type Outcome = z.infer<typeof Outcome>;

export const Measure = z.object({
  key: z.string(),
  iteration: z.int(),
  outcome: Outcome,
  minutes: z.number(),
  sessions: z.int(),
  turns: z.int(),
  tokens: z.int(),
  costUsd: z.number().nullable(),
  reviewRounds: z.int(),
  fixRounds: z.int(),
  workTasks: z.int(),
  firstPass: z.int(),
  checkFailures: z.int(),
});
export type Measure = z.infer<typeof Measure>;

const MINUTE_MS = 60_000;

const minutesBetween = (from: number, to: number): number =>
  Math.round(((to - from) / MINUTE_MS) * 10) / 10;

export const emptyMeasure = (key: string, iteration: number, outcome: Outcome): Measure => ({
  key,
  iteration,
  outcome,
  minutes: 0,
  sessions: 0,
  turns: 0,
  tokens: 0,
  costUsd: null,
  reviewRounds: 0,
  fixRounds: 0,
  workTasks: 0,
  firstPass: 0,
  checkFailures: 0,
});

export async function measure(
  office: Office,
  projectId: ProjectId,
  request: { key: string; iteration: number; rootTaskId: TaskId },
  closed: { mandate: Mandate | null; outcome: Outcome },
  window: { from: number; to: number },
): Promise<Measure> {
  const all = await office.tasks.list({ projectId });
  const tasks = all.filter(
    (task) =>
      task.id === request.rootTaskId ||
      (closed.mandate !== null && task.mandateId === closed.mandate.id),
  );
  const perTask = await Promise.all(tasks.map((task) => office.sessions.list({ taskId: task.id })));
  const sessions = perTask.flat();
  const usage = sessions.reduce((sum, session) => addUsage(sum, session.usage), ZERO_USAGE);
  const costs = sessions
    .map((session) => session.costUsd)
    .filter((cost): cost is number => cost !== undefined);
  const work = tasks.filter((task) => task.kind === "work");
  return {
    key: request.key,
    iteration: request.iteration,
    outcome: closed.outcome,
    minutes: minutesBetween(window.from, window.to),
    sessions: sessions.length,
    turns: usage.turns,
    tokens: usage.inputTokens + usage.outputTokens,
    costUsd: costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0),
    reviewRounds: work.reduce((sum, task) => sum + task.reviewRounds, 0),
    fixRounds: closed.mandate?.round ?? 0,
    workTasks: work.length,
    firstPass: work.filter(
      (task) => task.status === "done" && task.reviewRounds === 0 && verifyAttempts(task) === 0,
    ).length,
    checkFailures: work.reduce((sum, task) => sum + verifyAttempts(task), 0),
  };
}
