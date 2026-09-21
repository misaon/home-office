import type { AgentId, Task } from "@ho/protocol";
import { convene, type World } from "@ho/sim";
import { model } from "../store.ts";

const MEETING_MIN = 3;

type Decision = Task & { source: { kind: "mandate" } };

export const isDecision = (task: Task): task is Decision =>
  task.kind === "triage" && task.source.kind === "mandate";

export const deciding = (task: Task): boolean =>
  task.status === "assigned" || task.status === "in_progress";

export function conveneFor(world: World, task: Decision): void {
  if (task.assigneeId === undefined) {
    return;
  }
  const { mandateId } = task.source;
  const participants = new Set<AgentId>([task.assigneeId]);
  for (const other of model.tasks.values()) {
    if (
      other.mandateId === mandateId &&
      other.assigneeId !== undefined &&
      (other.kind === "work" || other.kind === "verify")
    ) {
      participants.add(other.assigneeId);
    }
  }
  if (participants.size >= MEETING_MIN) {
    convene(world, task.projectId, [...participants], task.id);
  }
}
