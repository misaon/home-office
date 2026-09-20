import type { Task } from "@ho/protocol";

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const present = (parts: readonly (string | null)[]): string[] =>
  parts.filter((part): part is string => part !== null && part !== "");

export const describeOutcome = (task: Task, reason: string | undefined, max: number): string => {
  const { report, prUrl, branch } = task.artifacts;
  const account = present([
    report ?? null,
    reason === undefined || reason === report ? null : reason,
  ]).join("\n");
  return present([
    clip(account, max),
    prUrl === undefined ? null : `Pull request: ${prUrl}`,
    branch === undefined ? null : `Branch: ${branch}`,
  ]).join("\n");
};
