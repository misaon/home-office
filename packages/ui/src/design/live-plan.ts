import { threadOfTask } from "@ho/core";
import type { PlanUsageStatus, ProjectId, Task } from "@ho/protocol";
import { type Snapshot, useUi } from "../store.ts";
import type { ThreadPick } from "./data.ts";

export type PlanShare = { title: string; percent: number; running: boolean };

type Running = ReadonlyMap<string, number>;

const shareOf = (
  snapshot: Snapshot,
  task: Task,
  running: Running,
): { percent: number; running: boolean } => {
  let percent = 0;
  let live = false;
  for (const session of snapshot.sessions.values()) {
    if (session.taskId !== task.id) {
      continue;
    }
    const current = running.get(session.id);
    if (current === undefined) {
      percent += session.planPercent ?? 0;
    } else {
      live = true;
      percent += current;
    }
  }
  return { percent, running: live };
};

export function useThreadPlanShare(
  floorId: ProjectId,
  thread: ThreadPick | "new",
  status: PlanUsageStatus | undefined,
): PlanShare | null {
  const snapshot = useUi((s) => s.snapshot);
  if (status?.kind !== "ok" || thread === "new") {
    return null;
  }
  const running: Running = new Map(Object.entries(status.running));
  const candidates = [...snapshot.tasks.values()]
    .filter(
      (task) => task.projectId === floorId && (threadOfTask(snapshot, task) ?? "main") === thread,
    )
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown =
    candidates.find((task) => shareOf(snapshot, task, running).running) ??
    candidates.find((task) => shareOf(snapshot, task, running).percent > 0);
  if (shown === undefined) {
    return null;
  }
  const share = shareOf(snapshot, shown, running);
  return { title: shown.title, percent: share.percent, running: share.running };
}

export const formatShare = (percent: number): string =>
  percent < 10 ? percent.toFixed(1) : String(Math.round(percent));

export const resetIn = (iso: string | null, now: number): string | null => {
  if (iso === null) {
    return null;
  }
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${String(hours)} h ${String(minutes % 60).padStart(2, "0")} min`
    : `${String(minutes)} min`;
};
