import type { RuntimeSession } from "@ho/core";
import type { SessionMode } from "@ho/protocol";
import type { SessionContext } from "./session-provision.ts";

export type Reminder = "half" | "late";

const HALF_FROM_TURNS = 20;
const LATE_TURNS = 10;
const LATE_VERDICT_TURNS = 6;
const WALL_SHARE = 0.8;
const WALL_FROM_MINUTES = 10;
const MINUTE_MS = 60_000;

const criteriaLines = (ctx: SessionContext): string => {
  const criteria = ctx.task.spec?.acceptanceCriteria ?? [];
  return criteria.length === 0
    ? "The task has no numbered criteria; the brief is the contract."
    : `The acceptance criteria you report on, each with how you verified it:\n${criteria
        .map((text, index) => `${String(index + 1)}. ${text}`)
        .join("\n")}`;
};

const halfway = (ctx: SessionContext, toolCalls: number, minutes: number, wall: number): string =>
  `Office check-in: ${String(toolCalls)} of ${String(ctx.budget.turns)} tool turns of this session are used, ${String(minutes)} of ${String(wall)} minutes. ${criteriaLines(ctx)}\nCommit what is consistent now; uncommitted work is lost when the budget ends. If the rest does not fit, finish a coherent part, run the check, and ho_report with what holds and what stays open.`;

const lastTurns = (left: number): string =>
  `Office check-in: ${String(left)} tool turns left in this session. Start nothing new: commit, run the floor's check once if you have not, and call ho_report now with what holds and what stays open; a report beats an unfinished tree.`;

const verdictSoon = (mode: SessionMode, left: number): string =>
  mode === "review"
    ? `Office check-in: ${String(left)} tool turns left. File ho_review now with what you have seen; judge what you could not exercise as not_checked with the reason, and make no other tool call after it.`
    : `Office check-in: ${String(left)} tool turns left. File ho_verify now with what you have seen; judge what you could not exercise with fidelity static and blocker not_attempted, and make no other tool call after it.`;

export function turnReminder(
  ctx: SessionContext,
  toolCalls: number,
  sent: Set<Reminder>,
  now: number,
  wallMinutes: number,
): string | null {
  const { turns } = ctx.budget;
  const { mode } = ctx.session;
  const left = turns - toolCalls;
  if (mode === "work") {
    if (!sent.has("half") && turns >= HALF_FROM_TURNS && toolCalls >= Math.ceil(turns / 2)) {
      sent.add("half");
      const minutes = Math.round((now - Date.parse(ctx.session.startedAt)) / MINUTE_MS);
      return halfway(ctx, toolCalls, minutes, wallMinutes);
    }
    if (!sent.has("late") && turns >= HALF_FROM_TURNS && left <= LATE_TURNS) {
      sent.add("late");
      return lastTurns(left);
    }
    return null;
  }
  if (
    (mode === "review" || mode === "verify") &&
    !sent.has("late") &&
    turns > LATE_VERDICT_TURNS &&
    left <= LATE_VERDICT_TURNS
  ) {
    sent.add("late");
    return verdictSoon(mode, left);
  }
  return null;
}

const wallText = (wallMinutes: number): string =>
  `Office check-in: ${String(Math.round(wallMinutes * WALL_SHARE))} of ${String(wallMinutes)} minutes of this session are gone. Commit what is consistent and head for ho_report or your verdict; the session ends when the time is up, whatever state the tree is in.`;

export function watchWall(
  wallMinutes: number,
  controller: AbortController,
  runtime: () => RuntimeSession | null,
  onReminder: (text: string) => void,
  onExhausted: () => void,
): () => void {
  const exhausted = setTimeout(() => {
    onExhausted();
    controller.abort(new Error(`wall-time budget of ${String(wallMinutes)} minute(s) exhausted`));
  }, wallMinutes * MINUTE_MS);
  const reminder =
    wallMinutes < WALL_FROM_MINUTES
      ? null
      : setTimeout(
          () => {
            const text = wallText(wallMinutes);
            if (runtime()?.send(text) === true) {
              onReminder(text);
            }
          },
          wallMinutes * MINUTE_MS * WALL_SHARE,
        );
  return () => {
    clearTimeout(exhausted);
    if (reminder !== null) {
      clearTimeout(reminder);
    }
  };
}
