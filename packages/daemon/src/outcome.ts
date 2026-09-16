import type { Task } from "@ho/protocol";

export const describeOutcome = (task: Task, reason: string | undefined, max: number): string =>
  [
    task.artifacts.report ?? null,
    reason === undefined || reason === "" || reason === task.artifacts.report ? null : reason,
    task.artifacts.branch === undefined ? null : `Branch: ${task.artifacts.branch}`,
    task.artifacts.prUrl === undefined ? null : `Pull request: ${task.artifacts.prUrl}`,
  ]
    .filter((part): part is string => part !== null)
    .join("\n")
    .slice(0, max);
