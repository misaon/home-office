import { threadOfTask } from "@ho/core";
import {
  type Agent,
  isSessionActive,
  type LiveEvent,
  type ProjectId,
  type Session,
  type Task,
} from "@ho/protocol";
import { type Snapshot, useUi } from "../store.ts";
import { elapsed } from "./clock.ts";
import type { SessionCard, SessionOutcome, ThreadPick } from "./data.ts";
import { useNow } from "./live.ts";
import { transcriptOf } from "./transcript.ts";

const outcomeOf = (session: Session): SessionOutcome =>
  isSessionActive(session.state) ? "running" : session.state === "failed" ? "failed" : "done";

function cardOf(
  session: Session,
  agent: Agent,
  task: Task,
  events: readonly LiveEvent[] | undefined,
  now: number,
): SessionCard {
  const live = isSessionActive(session.state);
  const { steps, text, activity } = transcriptOf(events ?? []);
  const end = live ? now : new Date(session.endedAt ?? session.startedAt).getTime();
  return {
    id: session.id,
    agentId: agent.id,
    taskId: task.id,
    name: agent.name,
    initial: agent.name.charAt(0).toUpperCase(),
    role: agent.role,
    mode: session.mode,
    model: session.runtime?.confirmedModel ?? session.runtime?.model ?? agent.model,
    effort: session.runtime?.confirmedEffort ?? session.runtime?.effort ?? agent.effort,
    live,
    outcome: outcomeOf(session),
    startedAt: session.startedAt,
    since: elapsed(session.startedAt, end),
    costUsd: session.costUsd ?? null,
    turns: session.usage.turns,
    taskTitle: task.title,
    traced: events !== undefined,
    steps: live ? steps : steps.filter((step) => step.change !== null || step.kind !== "tool"),
    activity: live ? activity : null,
    text,
  };
}

const inThread = (
  snapshot: Snapshot,
  session: Session,
  task: Task,
  thread: ThreadPick | "new",
): boolean => (session.threadId ?? threadOfTask(snapshot, task) ?? "main") === thread;

export function useThreadSessions(floorId: ProjectId, thread: ThreadPick | "new"): SessionCard[] {
  const snapshot = useUi((s) => s.snapshot);
  const live = useUi((s) => s.live);
  const now = useNow(1000);
  return [...snapshot.sessions.values()]
    .flatMap((session): SessionCard[] => {
      const agent = snapshot.agents.get(session.agentId);
      const task = snapshot.tasks.get(session.taskId);
      if (
        agent === undefined ||
        task === undefined ||
        agent.projectId !== floorId ||
        !inThread(snapshot, session, task, thread)
      ) {
        return [];
      }
      return [cardOf(session, agent, task, live.get(session.id), now)];
    })
    .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt));
}
