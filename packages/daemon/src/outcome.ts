import { clip, type Task } from "@ho/protocol";

const present = (parts: readonly (string | null)[]): string[] =>
  parts.filter((part): part is string => part !== null && part !== "");

export type Outcome = { account: string; prUrl: string | null; branch: string | null };

export const outcomeOf = (task: Task, reason: string | undefined, max: number): Outcome => {
  const { report, prUrl, branch } = task.artifacts;
  const account = present([
    report ?? null,
    reason === undefined || reason === report ? null : reason,
  ]).join("\n");
  return { account: clip(account, max), prUrl: prUrl ?? null, branch: branch ?? null };
};

export const describeOutcome = (task: Task, reason: string | undefined, max: number): string => {
  const outcome = outcomeOf(task, reason, max);
  return present([
    outcome.account,
    outcome.prUrl === null ? null : `Pull request: ${outcome.prUrl}`,
    outcome.branch === null ? null : `Branch: ${outcome.branch}`,
  ]).join("\n");
};
