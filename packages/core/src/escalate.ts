import { EffortLevel, type Task } from "@ho/protocol";
import { verifyAttempts } from "./commands/verification.ts";

export const setbacksOf = (task: Task): number => verifyAttempts(task) + task.reviewRounds;

export const escalatedEffort = (
  effort: EffortLevel,
  available: readonly EffortLevel[],
  setbacks: number,
): EffortLevel => {
  if (setbacks <= 0) {
    return effort;
  }
  const ladder = EffortLevel.options.filter((level) =>
    available.length === 0 ? true : available.includes(level),
  );
  const at = ladder.indexOf(effort);
  if (at === -1) {
    return effort;
  }
  return ladder[Math.min(at + setbacks, ladder.length - 1)] ?? effort;
};
