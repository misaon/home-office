import type { ChatMessageId, TaskId } from "@ho/protocol";
import { useState } from "react";
import { getClient } from "../rpc.ts";
import type { Snapshot } from "../store.ts";
import { type StepStatus, teamStatus } from "./status.ts";
import { describeError, Step } from "./step.tsx";
import { createDefaultTeam, DEFAULT_TEAM } from "./team.ts";

export function TeamStep({ snapshot }: { snapshot: Snapshot }): React.JSX.Element {
  const status = teamStatus(snapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (): Promise<void> => {
    const client = getClient();
    if (client === null) {
      return;
    }
    setBusy(true);
    try {
      await createDefaultTeam(
        client,
        [...snapshot.agents.values()].map((a) => a.name),
      );
      setError(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Step index={4} title="Team" status={status}>
      {status.state === "ok" ? (
        <p className="text-gray-300">
          Edit names, models, sprites and personas in Settings → Agents.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-gray-300">
            Hire the default team; you can reshape it in Settings later:
          </p>
          <ul className="grid grid-cols-2 gap-x-3 text-gray-300">
            {DEFAULT_TEAM.map((m) => (
              <li key={m.name}>
                <b>{m.name}</b> · {m.role} · {m.model}/{m.effort}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              void create();
            }}
          >
            {busy ? "Hiring…" : "Create the default team"}
          </button>
          {error === null ? null : <p className="text-red-400">{error}</p>}
        </div>
      )}
    </Step>
  );
}

const repoOf = (source: string): { kind: "git"; url: string } | { kind: "local"; path: string } =>
  /^(?:https?:|git@|ssh:|file:)/u.test(source)
    ? { kind: "git", url: source }
    : { kind: "local", path: source };

export function ProjectStep({ snapshot }: { snapshot: Snapshot }): React.JSX.Element {
  const projects = [...snapshot.projects.values()].filter((p) => p.repo.kind !== "none");
  const status: StepStatus =
    projects.length > 0
      ? {
          state: "ok",
          text: `${String(projects.length)} project(s): ${projects.map((p) => p.name).join(", ")}`,
        }
      : { state: "todo", text: "optional now; every project becomes a floor of the office" };
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = async (): Promise<void> => {
    const client = getClient();
    const trimmed = source.trim();
    if (client === null || trimmed === "" || name.trim() === "") {
      return;
    }
    try {
      const project = await client.projects.create({ name: name.trim(), repo: repoOf(trimmed) });
      // Everybody but the boss joins the new project so delegation has somewhere to go.
      for (const agent of snapshot.agents.values()) {
        if (agent.role !== "boss" && !agent.projectIds.includes(project.id)) {
          await client.agents.update({
            id: agent.id,
            patch: { projectIds: [...agent.projectIds, project.id] },
          });
        }
      }
      setName("");
      setSource("");
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  };
  return (
    <Step index={5} title="First project" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          A local repository path or a git URL. Workers and the reviewer are added to it
          automatically; the boss works from the Lobby.
        </p>
        <input
          className="w-full rounded bg-ink px-2 py-1"
          placeholder="Project name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <input
          className="w-full rounded bg-ink px-2 py-1 font-mono"
          placeholder="/path/to/repo or https://github.com/org/repo.git"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
          }}
        />
        <button
          type="button"
          className="rounded bg-line px-2 py-1"
          onClick={() => {
            void add();
          }}
        >
          Add project
        </button>
        {error === null ? null : <p className="text-red-400">{error}</p>}
      </div>
    </Step>
  );
}

const HELLO =
  "Hello! This is the first-run check of Home Office. Reply with one short sentence confirming you are online; do not delegate anything.";

type Sent = { messageId: ChatMessageId; taskId: TaskId | null; at: string };

function smokeStatus(snapshot: Snapshot, sent: Sent | null, ready: boolean): StepStatus {
  if (sent === null) {
    return ready
      ? { state: "todo", text: "one short triage session with the boss" }
      : { state: "todo", text: "finish the steps above first" };
  }
  const reply = snapshot.chat.find((m) => m.author.kind === "agent" && m.at > sent.at);
  if (reply !== undefined) {
    return {
      state: "ok",
      text: `the boss answered in ${String(Math.round((new Date(reply.at).getTime() - new Date(sent.at).getTime()) / 1000))} s`,
    };
  }
  const task = sent.taskId === null ? undefined : snapshot.tasks.get(sent.taskId);
  if (task === undefined) {
    return { state: "unknown", text: "message sent, waiting for the boss…" };
  }
  if (task.status === "failed" || task.status === "blocked") {
    return { state: "error", text: task.artifacts.report ?? `triage ${task.status}` };
  }
  const session = [...snapshot.sessions.values()].find((s) => s.taskId === task.id);
  return {
    state: "unknown",
    text:
      session === undefined
        ? `task ${task.status}, session queued…`
        : `session ${session.state} (${String(session.usage.turns)} turns)…`,
  };
}

export function SmokeStep({
  snapshot,
  ready,
}: {
  snapshot: Snapshot;
  ready: boolean;
}): React.JSX.Element {
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = smokeStatus(snapshot, sent, ready);
  const boss = [...snapshot.agents.values()].find((a) => a.role === "boss");
  const send = (): void => {
    const client = getClient();
    if (client === null) {
      return;
    }
    client.chat.send({ text: HELLO }).then(
      ({ message, task }) => {
        setSent({ messageId: message.id, taskId: task?.id ?? null, at: message.at });
        setError(null);
      },
      (e: unknown) => {
        setError(describeError(e));
      },
    );
  };
  const reply =
    sent === null
      ? undefined
      : snapshot.chat.find((m) => m.author.kind === "agent" && m.at > sent.at);
  return (
    <Step index={6} title="Smoke test" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          Sends a hello to {boss?.name ?? "the boss"}: the first sandbox starts, Claude Code signs
          in with your token and the reply lands in Chat. Expect 20–60 seconds and a few hundred
          tokens on {boss?.model ?? "the boss's model"}.
        </p>
        {reply === undefined ? (
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
            disabled={!ready || (sent !== null && status.state === "unknown")}
            onClick={send}
          >
            {sent === null ? "Say hello" : "Try again"}
          </button>
        ) : (
          <blockquote className="rounded bg-ink p-2 text-gray-200">{reply.text}</blockquote>
        )}
        {error === null ? null : <p className="text-red-400">{error}</p>}
      </div>
    </Step>
  );
}
