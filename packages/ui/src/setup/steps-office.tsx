import type { ChatMessageId, ProjectId, TaskId } from "@ho/protocol";
import { useState } from "react";
import { getClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";
import type { StepStatus } from "./status.ts";
import { describeError, Step } from "./step.tsx";

const HELLO =
  "Hello! This is the first-run check of Home Office. Reply with one short sentence confirming you are online; do not delegate anything.";

type Sent = { messageId: ChatMessageId; taskId: TaskId | null; at: string };

const replyTo = (snapshot: Snapshot, sent: Sent, floorId: ProjectId): boolean | string => {
  const reply = snapshot.chat.find(
    (m) => m.projectId === floorId && m.author.kind === "agent" && m.at > sent.at,
  );
  return reply === undefined ? false : reply.text;
};

function smokeStatus(
  snapshot: Snapshot,
  sent: Sent | null,
  ready: boolean,
  floorId: ProjectId | null,
): StepStatus {
  if (floorId === null) {
    return { state: "todo", text: "add a project (floor) first; its boss answers the hello" };
  }
  if (sent === null) {
    return ready
      ? { state: "todo", text: "one short triage session with the floor's boss" }
      : { state: "todo", text: "finish the steps above first" };
  }
  const reply = replyTo(snapshot, sent, floorId);
  if (typeof reply === "string") {
    const answered = snapshot.chat.find((m) => m.text === reply)?.at ?? sent.at;
    return {
      state: "ok",
      text: `the boss answered in ${String(Math.round((new Date(answered).getTime() - new Date(sent.at).getTime()) / 1000))} s`,
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
  const floorId = useUi((s) => s.floorId);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = smokeStatus(snapshot, sent, ready, floorId);
  const boss = [...snapshot.agents.values()].find(
    (a) => a.role === "boss" && a.projectId === floorId,
  );
  const send = (): void => {
    const client = getClient();
    if (client === null || floorId === null) {
      return;
    }
    client.chat.send({ text: HELLO, projectId: floorId }).then(
      ({ message, task }) => {
        setSent({ messageId: message.id, taskId: task?.id ?? null, at: message.at });
        setError(null);
      },
      (e: unknown) => {
        setError(describeError(e));
      },
    );
  };
  const reply = sent === null || floorId === null ? false : replyTo(snapshot, sent, floorId);
  return (
    <Step index={4} title="Smoke test" status={status}>
      <div className="space-y-1">
        <p className="text-gray-300">
          Sends a hello to {boss?.name ?? "the boss"} of the selected floor: the first sandbox
          starts, Claude Code signs in with your token and the reply lands in Chat. Expect 20–60
          seconds and a few hundred tokens on {boss?.model ?? "the boss's model"}.
        </p>
        {typeof reply === "string" ? (
          <blockquote className="rounded bg-ink p-2 text-gray-200">{reply}</blockquote>
        ) : (
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
            disabled={!ready || floorId === null || (sent !== null && status.state === "unknown")}
            onClick={send}
          >
            {sent === null ? "Say hello" : "Try again"}
          </button>
        )}
        {error === null ? null : <p className="text-red-400">{error}</p>}
      </div>
    </Step>
  );
}
