import { chatOf } from "@ho/core";
import {
  isSessionActive,
  type Agent,
  type ChatMessage,
  type Project,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import { useEffect, useState } from "react";
import { useUi, type Snapshot } from "../store.ts";

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
import type { Card, Floor, Lane, Member, Message } from "./data.ts";

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

const clock = (iso: string): string => {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

const stamp = (iso: string): string => {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
};

/** "41 minutes", the way the drawing writes an age. */
const since = (iso: string, now: number): string => {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${String(hours)} h` : `${String(Math.round(hours / 24))} d`;
};

const repoPath = (project: Project): string =>
  project.repo.kind === "local" ? project.repo.path : project.repo.url;

function memberOf(agent: Agent, snapshot: Snapshot, now: number): Member {
  const session = [...snapshot.sessions.values()].find(
    (s) => s.agentId === agent.id && isSessionActive(s.state),
  );
  const task = session === undefined ? undefined : snapshot.tasks.get(session.taskId);
  return {
    id: agent.id,
    i: agent.name.charAt(0).toUpperCase(),
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
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
  const first = message.attachments[0];
  return {
    id: message.id,
    mine,
    ...(who === undefined ? {} : { who }),
    time: stamp(message.at),
    text: message.text,
    ...(first === undefined ? {} : { img: first.name, attachment: first }),
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

/** Every floor the office has, in the order the picker lists them. */
export function useFloors(): Floor[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return [...snapshot.projects.values()]
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((project) => floorOf(project, snapshot, now));
}

/** The floor every panel is talking about; null until the office has its first project. */
export function useFloor(): Floor | null {
  const floors = useFloors();
  const floorId = useUi((s) => s.floorId);
  return floors.find((f) => f.id === floorId) ?? floors[0] ?? null;
}

/** The floor's boss, who is the one the human talks to. */
export const bossOf = (floor: Floor): Member | undefined =>
  floor.team.find((p) => p.role === "boss");
