import { EffortLevel, type SessionMode, type Task, type TaskShape } from "@ho/protocol";
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

const ladderOf = (available: readonly EffortLevel[]): EffortLevel[] =>
  EffortLevel.options.filter((level) =>
    available.length === 0 ? true : available.includes(level),
  );

export const shapedEffort = (
  effort: EffortLevel,
  available: readonly EffortLevel[],
  shape: TaskShape,
  mode: SessionMode,
): EffortLevel => {
  if (mode !== "work" && mode !== "review") {
    return effort;
  }
  const ladder = ladderOf(available);
  const at = ladder.indexOf(effort);
  if (shape === "mechanical") {
    return ladder[0] ?? effort;
  }
  if (shape === "risky" && mode === "work" && at !== -1) {
    return ladder[Math.min(at + 1, ladder.length - 1)] ?? effort;
  }
  return effort;
};
