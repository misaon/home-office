import { chatOf } from "@ho/core";
import {
  type Agent,
  type AgentId,
  type ProjectId,
  type SessionId,
  type ChatMessage,
  type Project,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import { useEffect, useState } from "react";
import { activeSessionOf, sortedFloors, useUi, type Snapshot } from "../store.ts";
import type { Card, Floor, Lane, Member, Message } from "./data.ts";

/**
 * A clock that ticks rather than being read mid-render: how long ago a session started has to keep
 * changing, and reading `Date.now()` while rendering makes the answer unstable.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/**
 * The office as the drawing expects it. The design was made against a simpler picture than the domain
 * carries — three lanes rather than nine task states, one "working or idle" rather than five session
 * states — so this is the one place that decides how the real thing is said in the drawn language.
 * Everything above it reads these shapes and nothing else.
 */

/** Nine task states, three lanes and a queue: what the board can actually draw. */
const laneOf = (status: TaskStatus): Lane =>
  status === "blocked"
    ? "blocked"
    : status === "done" || status === "failed" || status === "cancelled"
      ? "done"
      : status === "inbox" || status === "planned"
        ? "queued"
        : "running";

const pad = (v: number): string => String(v).padStart(2, "0");

/** The wall clock, to the minute where the board writes it and to the second where the chat does. */
const clock = (iso: string, seconds = false): string => {
  const at = new Date(iso);
  const parts = seconds
    ? [at.getHours(), at.getMinutes(), at.getSeconds()]
    : [at.getHours(), at.getMinutes()];
  return parts.map((v) => pad(v)).join(":");
};

/** How long ago, in whole minutes and never negative; both ways of writing an age start here. */
const minutesSince = (iso: string, now: number): number =>
  Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

/** "41 minutes", the way the drawing writes an age. */
const since = (iso: string, now: number): string => {
  const minutes = minutesSince(iso, now);
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${String(hours)} h` : `${String(Math.round(hours / 24))} d`;
};

const repoPath = (project: Project): string =>
  project.repo.kind === "local" ? project.repo.path : project.repo.url;

function memberOf(agent: Agent, snapshot: Snapshot, now: number): Member {
  const session = activeSessionOf(snapshot, agent.id);
  const task = session === undefined ? undefined : snapshot.tasks.get(session.taskId);
  return {
    id: agent.id,
    i: agent.name.charAt(0).toUpperCase(),
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
    auth: agent.auth,
    gender: agent.appearance.gender,
    model: agent.model,
    effort: agent.effort,
    status: session === undefined ? "idle" : "working",
    doing: task?.title ?? "Waiting for work",
    since: session === undefined ? "idle" : `started ${since(session.startedAt, now)} ago`,
    prompt: agent.basePrompt,
  };
}

function cardOf(task: Task, snapshot: Snapshot): Card {
  return {
    id: task.id,
    t: task.title,
    p: task.priority,
    k: task.kind === "triage" ? "triage" : "code",
    criteria: task.spec?.acceptanceCriteria ?? [],
    who: task.assigneeId === undefined ? "" : (snapshot.agents.get(task.assigneeId)?.name ?? ""),
    s: laneOf(task.status),
    status: task.status,
    at: clock(task.updatedAt),
  };
}

function messageOf(message: ChatMessage, snapshot: Snapshot): Message {
  const mine = message.author.kind === "human";
  const who =
    message.author.kind === "agent" ? snapshot.agents.get(message.author.agentId)?.name : undefined;
  const [first] = message.attachments;
  return {
    id: message.id,
    mine,
    ...(who === undefined ? {} : { who }),
    time: clock(message.at, true),
    text: message.text,
    ...(first === undefined ? {} : { attachment: first }),
  };
}

/** One project, dressed as the floor the drawing knows. */
function floorOf(project: Project, snapshot: Snapshot, now: number): Floor {
  return {
    id: project.id,
    name: project.name,
    path: repoPath(project),
    pr: project.publish.mode === "pull-request",
    issues: project.intake.enabled,
    services: project.services.enabled,
    verify: project.verify.command,
    team: [...snapshot.agents.values()]
      .filter((a) => a.projectId === project.id)
      .toSorted((a, b) =>
        a.role === b.role ? a.name.localeCompare(b.name) : a.role === "boss" ? -1 : 1,
      )
      .map((a) => memberOf(a, snapshot, now)),
    cards: [...snapshot.tasks.values()]
      .filter((task) => task.projectId === project.id)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((task) => cardOf(task, snapshot)),
    messages: chatOf({ chat: snapshot.chat }, project.id).map((m) => messageOf(m, snapshot)),
  };
}

/** "now", "-18m", "-2h": how the drawing writes the age of something that already happened. */
const ago = (iso: string, now: number): string => {
  const minutes = minutesSince(iso, now);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `-${String(minutes)}m`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `-${String(hours)}h` : `-${String(Math.round(hours / 24))}d`;
};

/** The floor's boss while it is actually running something, and the session that can be cut off. */
export function useBossSession(
  floorId: ProjectId,
): { sessionId: SessionId; name: string; doing: string } | null {
  const snapshot = useUi((s) => s.snapshot);
  const boss = [...snapshot.agents.values()].find(
    (a) => a.projectId === floorId && a.role === "boss",
  );
  if (boss === undefined) {
    return null;
  }
  const session = activeSessionOf(snapshot, boss.id);
  if (session === undefined) {
    return null;
  }
  return {
    sessionId: session.id,
    name: boss.name,
    doing: snapshot.tasks.get(session.taskId)?.title ?? "working",
  };
}

/** What this colleague has been at: the tasks they hold or reviewed, newest first. */
export function useAgentWork(agentId: AgentId): { t: string; x: string }[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return [...snapshot.tasks.values()]
    .filter((task) => task.assigneeId === agentId || task.reviewerId === agentId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)
    .map((task) => ({ t: ago(task.updatedAt, now), x: task.title }));
}

/** Every floor the office has, in the order the picker lists them. */
export function useFloors(): Floor[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return sortedFloors(snapshot.projects).map((project) => floorOf(project, snapshot, now));
}

/**
 * The floor every panel is talking about; null until the office has its first project. Eight components
 * ask for it, so it dresses that one project rather than dressing every floor and picking one out.
 */
export function useFloor(): Floor | null {
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  const now = useNow();
  const chosen = floorId === null ? undefined : snapshot.projects.get(floorId);
  const project = chosen ?? sortedFloors(snapshot.projects)[0];
  return project === undefined ? null : floorOf(project, snapshot, now);
}

/** The floor's boss, who is the one the human talks to. */
export const bossOf = (floor: Floor): Member | undefined =>
  floor.team.find((p) => p.role === "boss");
