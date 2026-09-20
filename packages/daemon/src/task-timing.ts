import { chatOf, type ReadModel, sessionsOfTask } from "@ho/core";
import type { Task } from "@ho/protocol";

const WALK_MAX = 8;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const twoUnits = (
  ms: number,
  big: { size: number; unit: string },
  small: { size: number; unit: string },
): string => {
  const whole = Math.floor(ms / big.size);
  const rest = Math.round((ms - whole * big.size) / small.size);
  return rest === 0
    ? `${String(whole)} ${big.unit}`
    : `${String(whole)} ${big.unit} ${String(rest)} ${small.unit}`;
};

export const formatDuration = (ms: number): string => {
  const clamped = Math.max(0, ms);
  if (clamped < MINUTE) {
    return `${String(Math.round(clamped / SECOND))} s`;
  }
  if (clamped < HOUR) {
    return `${String(Math.round(clamped / MINUTE))} min`;
  }
  if (clamped < DAY) {
    return twoUnits(clamped, { size: HOUR, unit: "h" }, { size: MINUTE, unit: "min" });
  }
  return twoUnits(clamped, { size: DAY, unit: "d" }, { size: HOUR, unit: "h" });
};

function requestedAt(model: Pick<ReadModel, "tasks" | "chat">, task: Task): string {
  let current: Task | undefined = task;
  let earliest = task.createdAt;
  for (let depth = 0; depth < WALK_MAX && current !== undefined; depth += 1) {
    earliest = current.createdAt < earliest ? current.createdAt : earliest;
    const { source } = current;
    if (source.kind === "chat") {
      const message = chatOf(model, current.projectId).find((m) => m.id === source.messageId);
      return message?.at ?? earliest;
    }
    if (source.kind !== "delegation" || source.parentTaskId === undefined) {
      return earliest;
    }
    current = model.tasks.get(source.parentTaskId);
  }
  return earliest;
}

export type TaskTiming = { sinceRequestMs: number; agentMs: number; sessions: number };

export function timingOf(
  model: Pick<ReadModel, "tasks" | "chat" | "sessions" | "sessionsByTask">,
  task: Task,
  at: string,
): TaskTiming {
  const end = Date.parse(at);
  const sessions = sessionsOfTask(model, task.id);
  const agentMs = sessions.reduce(
    (sum, session) =>
      sum + Math.max(0, Date.parse(session.endedAt ?? at) - Date.parse(session.startedAt)),
    0,
  );
  return {
    sinceRequestMs: Math.max(0, end - Date.parse(requestedAt(model, task))),
    agentMs,
    sessions: sessions.length,
  };
}
