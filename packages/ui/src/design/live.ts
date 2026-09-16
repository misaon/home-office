import { awaitsAnswer, chatOf } from "@ho/core";
import {
  type Agent,
  type AgentId,
  isSessionActive,
  type ProjectId,
  type SessionId,
  type ChatMessage,
  type Project,
  type Task,
  type TaskStatus,
} from "@ho/protocol";
import { useEffect, useState } from "react";
import { activeSessionOf, sortedFloors, useUi, type Snapshot } from "../store.ts";
import type { Card, Floor, Lane, Member, Message, Thread, ThreadPick } from "./data.ts";
import { type Activity, transcriptOf } from "./transcript.ts";

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

const laneOf = (status: TaskStatus): Lane =>
  status === "blocked"
    ? "blocked"
    : status === "done" || status === "failed" || status === "cancelled"
      ? "done"
      : status === "inbox" || status === "planned"
        ? "queued"
        : "running";

const pad = (v: number): string => String(v).padStart(2, "0");

const clock = (iso: string, seconds = false): string => {
  const at = new Date(iso);
  const parts = seconds
    ? [at.getHours(), at.getMinutes(), at.getSeconds()]
    : [at.getHours(), at.getMinutes()];
  return parts.map((v) => pad(v)).join(":");
};

const minutesSince = (iso: string, now: number): number =>
  Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

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
  const task = message.taskId === undefined ? undefined : snapshot.tasks.get(message.taskId);
  const asks =
    !mine && task !== undefined && awaitsAnswer(task)
      ? { taskId: task.id, who: who ?? task.title }
      : undefined;
  return {
    id: message.id,
    mine,
    ...(who === undefined ? {} : { who }),
    time: clock(message.at, true),
    text: message.text,
    ...(message.threadId === undefined ? {} : { threadId: message.threadId }),
    ...(asks === undefined ? {} : { asks }),
    ...(first === undefined ? {} : { attachment: first }),
  };
}

const CHIP_TITLE_MAX = 26;

const chipTitle = (text: string): string => {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? text;
  const trimmed = firstLine.trim();
  return trimmed.length <= CHIP_TITLE_MAX ? trimmed : `${trimmed.slice(0, CHIP_TITLE_MAX - 1)}…`;
};

function threadsOfChat(messages: readonly ChatMessage[], now: number): Thread[] {
  const threads = new Map<ThreadPick, Thread>();
  for (const message of messages) {
    const id: ThreadPick = message.threadId ?? "main";
    const known = threads.get(id);
    threads.set(id, {
      id,
      title: known?.title ?? chipTitle(message.text),
      count: (known?.count ?? 0) + 1,
      at: message.at,
      when: ago(message.at, now),
    });
  }
  return [...threads.values()].toSorted((a, b) => b.at.localeCompare(a.at));
}

function floorOf(project: Project, snapshot: Snapshot, now: number): Floor {
  const chat = chatOf({ chat: snapshot.chat }, project.id);
  return {
    id: project.id,
    name: project.name,
    path: repoPath(project),
    pr: project.publish.mode === "pull-request",
    issues: project.intake.enabled,
    services: project.services.enabled,
    preview: project.preview,
    hiring: project.hiring.enabled,
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
    messages: chat.map((m) => messageOf(m, snapshot)),
    threads: threadsOfChat(chat, now),
  };
}

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

export type { Activity, Step } from "./transcript.ts";

export function useFloorActivity(floorId: ProjectId): Activity[] {
  const snapshot = useUi((s) => s.snapshot);
  const live = useUi((s) => s.live);
  return [...snapshot.sessions.values()].flatMap((session) => {
    const agent = snapshot.agents.get(session.agentId);
    if (!isSessionActive(session.state) || agent === undefined || agent.projectId !== floorId) {
      return [];
    }
    const { steps, text } = transcriptOf(live.get(session.id) ?? []);
    return [{ id: agent.id, name: agent.name, steps, text }];
  });
}

export function useAgentWork(agentId: AgentId): { t: string; x: string }[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return [...snapshot.tasks.values()]
    .filter((task) => task.assigneeId === agentId || task.reviewerId === agentId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)
    .map((task) => ({ t: ago(task.updatedAt, now), x: task.title }));
}

export function useFloors(): Floor[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return sortedFloors(snapshot.projects).map((project) => floorOf(project, snapshot, now));
}

export function useFloor(): Floor | null {
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  const now = useNow();
  const chosen = floorId === null ? undefined : snapshot.projects.get(floorId);
  const project = chosen ?? sortedFloors(snapshot.projects)[0];
  return project === undefined ? null : floorOf(project, snapshot, now);
}

export const bossOf = (floor: Floor): Member | undefined =>
  floor.team.find((p) => p.role === "boss");
