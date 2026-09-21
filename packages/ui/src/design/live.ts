import { awaitsAnswer, chatOf, reviewPlanOf, type ReviewRoster, threadOfTask } from "@ho/core";
import { t } from "i18next";
import {
  type Agent,
  type AgentId,
  budgetGuaranteesFor,
  headline,
  isSessionActive,
  type ProjectId,
  type SessionId,
  type ChatMessage,
  type Project,
  type Task,
  type TaskId,
  type TaskStatus,
} from "@ho/protocol";
import { useEffect, useState } from "react";
import { activeSessionOf, sortedFloors, useUi, type Snapshot } from "../store.ts";
import type { Card, Floor, Lane, Member, Message, Thread, ThreadPick } from "./data.ts";
import { ago, clock, elapsed, since } from "./clock.ts";
import { cardEvidence } from "./live-mandates.ts";
import { type Activity, transcriptOf } from "./transcript.ts";

export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}

const LANES: Readonly<Record<TaskStatus, Lane>> = {
  inbox: "queued",
  planned: "queued",
  assigned: "running",
  in_progress: "running",
  review: "running",
  done: "done",
  blocked: "blocked",
  failed: "done",
  cancelled: "done",
};

const repoPath = (project: Project): string =>
  project.repo.kind === "local" ? project.repo.path : project.repo.url;

function memberOf(agent: Agent, snapshot: Snapshot, now: number): Member {
  const session = activeSessionOf(snapshot, agent.id);
  const task = session === undefined ? undefined : snapshot.tasks.get(session.taskId);
  return {
    id: agent.id,
    initial: agent.name.charAt(0).toUpperCase(),
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
    auth: agent.auth,
    gender: agent.appearance.gender,
    model: agent.model,
    effort: agent.effort,
    status: session === undefined ? "idle" : "working",
    doing: task?.title ?? t("team.waiting"),
    since:
      session === undefined
        ? t("team.idle")
        : t("team.startedAgo", { since: since(session.startedAt, now) }),
    prompt: agent.basePrompt,
    budgets: agent.budgets,
    guarantees: budgetGuaranteesFor(agent.provider, agent.auth),
  };
}

const rosterOf = (snapshot: Snapshot, projectId: ProjectId): ReviewRoster => ({
  agents: snapshot.agents,
  agentsByProject: new Map([
    [
      projectId,
      new Set(
        [...snapshot.agents.values()].filter((a) => a.projectId === projectId).map((a) => a.id),
      ),
    ],
  ]),
});

function cardOf(task: Task, snapshot: Snapshot): Card {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    kind: task.kind === "work" ? "code" : task.kind,
    criteria: task.spec?.acceptanceCriteria ?? [],
    evidence: cardEvidence(snapshot, task),
    request:
      task.mandateId === undefined ? null : (snapshot.mandates.get(task.mandateId)?.title ?? null),
    who: task.assigneeId === undefined ? "" : (snapshot.agents.get(task.assigneeId)?.name ?? ""),
    lane: LANES[task.status],
    status: task.status,
    rating: task.rating?.verdict ?? null,
    commit: task.artifacts.commit ?? null,
    buildsOn: task.dependsOn.map((id) => snapshot.tasks.get(id)?.title ?? id.slice(-8)),
    reviews: task.reviews,
    missingReviews:
      task.kind === "work" ? reviewPlanOf(rosterOf(snapshot, task.projectId), task).missing : [],
    at: clock(task.updatedAt),
  };
}

function messageOf(message: ChatMessage, snapshot: Snapshot): Message {
  const mine = message.author.kind === "human";
  const who =
    message.author.kind === "agent" ? snapshot.agents.get(message.author.agentId)?.name : undefined;
  const task = message.taskId === undefined ? undefined : snapshot.tasks.get(message.taskId);
  const asks =
    !mine && task !== undefined && awaitsAnswer(task)
      ? { taskId: task.id, who: who ?? task.title }
      : undefined;
  return {
    id: message.id,
    mine,
    ...(who === undefined ? {} : { who }),
    at: message.at,
    time: clock(message.at, true),
    text: message.text,
    ...(message.threadId === undefined ? {} : { threadId: message.threadId }),
    ...(asks === undefined ? {} : { asks }),
    attachments: message.attachments,
  };
}

const CHIP_TITLE_MAX = 26;

function threadsOfChat(messages: readonly ChatMessage[], now: number): Thread[] {
  const threads = new Map<ThreadPick, Thread>();
  for (const message of messages) {
    const id: ThreadPick = message.threadId ?? "main";
    const known = threads.get(id);
    threads.set(id, {
      id,
      title: known?.title ?? headline(message.text, CHIP_TITLE_MAX),
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
    trust: project.services.trust,
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

export function useThreadSession(
  floorId: ProjectId,
  thread: ThreadPick | "new",
): { sessionId: SessionId; name: string; doing: string } | null {
  const snapshot = useUi((s) => s.snapshot);
  const [running] = [...snapshot.activeByAgent.values()]
    .filter((session) => {
      const agent = snapshot.agents.get(session.agentId);
      const task = snapshot.tasks.get(session.taskId);
      return (
        agent?.projectId === floorId &&
        task !== undefined &&
        (threadOfTask(snapshot, task) ?? "main") === thread
      );
    })
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (running === undefined) {
    return null;
  }
  return {
    sessionId: running.id,
    name: snapshot.agents.get(running.agentId)?.name ?? "",
    doing: snapshot.tasks.get(running.taskId)?.title ?? "working",
  };
}

export type { Activity, FileChange, Step } from "./transcript.ts";

export function useFloorActivity(floorId: ProjectId, thread: ThreadPick | "new"): Activity[] {
  const snapshot = useUi((s) => s.snapshot);
  const live = useUi((s) => s.live);
  const now = useNow(1000);
  return [...snapshot.sessions.values()]
    .flatMap((session): Activity[] => {
      const agent = snapshot.agents.get(session.agentId);
      const task = snapshot.tasks.get(session.taskId);
      const events = live.get(session.id);
      const active = isSessionActive(session.state);
      if (agent === undefined || agent.projectId !== floorId || task === undefined) {
        return [];
      }
      if (
        (!active && events === undefined) ||
        (threadOfTask(snapshot, task) ?? "main") !== thread
      ) {
        return [];
      }
      const { steps, text } = transcriptOf(events ?? []);
      const endedAt = session.endedAt ?? session.startedAt;
      return [
        {
          id: agent.id,
          sessionId: session.id,
          name: agent.name,
          role: agent.role,
          mode: session.mode,
          model: session.runtime?.confirmedModel ?? session.runtime?.model ?? agent.model,
          effort: session.runtime?.confirmedEffort ?? session.runtime?.effort ?? agent.effort,
          live: active,
          startedAt: session.startedAt,
          steps: active ? steps : steps.filter((step) => step.change !== null),
          text,
          since: elapsed(session.startedAt, active ? now : new Date(endedAt).getTime()),
        },
      ];
    })
    .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function useAgentWork(agentId: AgentId): { id: TaskId; when: string; title: string }[] {
  const snapshot = useUi((s) => s.snapshot);
  const now = useNow();
  return [...snapshot.tasks.values()]
    .filter((task) => task.assigneeId === agentId || task.reviewerId === agentId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)
    .map((task) => ({ id: task.id, when: ago(task.updatedAt, now), title: task.title }));
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
