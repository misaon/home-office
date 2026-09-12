import { chatOf } from "@ho/core";
import { type ChatMessageId, errorMessage, type ProjectId, type TaskId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";
import type { TFunction } from "i18next";
import type { StepStatus } from "./status.ts";
import { Step } from "./step.tsx";

const HELLO =
  "Hello! This is the first-run check of Home Office. Reply with one short sentence confirming you are online; do not delegate anything.";

type Sent = { messageId: ChatMessageId; taskId: TaskId | null; at: string };

const replyTo = (snapshot: Snapshot, sent: Sent, floorId: ProjectId): string | null =>
  chatOf(snapshot, floorId).find(
    (m) => m.author.kind === "agent" && m.taskId === sent.taskId && m.at >= sent.at,
  )?.text ?? null;

function smokeStatus(
  snapshot: Snapshot,
  sent: Sent | null,
  ready: boolean,
  floorId: ProjectId | null,
  t: TFunction,
): StepStatus {
  if (floorId === null) {
    return { state: "todo", text: t("setup.needProject") };
  }
  if (sent === null) {
    return ready
      ? { state: "todo", text: t("setup.triageHint") }
      : { state: "todo", text: t("setup.finishFirst") };
  }
  const reply = replyTo(snapshot, sent, floorId);
  if (reply !== null) {
    const answered = chatOf(snapshot, floorId).find((m) => m.text === reply)?.at ?? sent.at;
    return {
      state: "ok",
      text: t("setup.bossAnswered", {
        seconds: String(
          Math.round((new Date(answered).getTime() - new Date(sent.at).getTime()) / 1000),
        ),
      }),
    };
  }
  const task = sent.taskId === null ? undefined : snapshot.tasks.get(sent.taskId);
  if (task === undefined) {
    return { state: "unknown", text: t("setup.messageSent") };
  }
  if (task.status === "failed" || task.status === "blocked") {
    return {
      state: "error",
      text: task.artifacts.report ?? t("setup.triageStatus", { status: task.status }),
    };
  }
  const session = [...snapshot.sessions.values()].find((s) => s.taskId === task.id);
  return {
    state: "unknown",
    text:
      session === undefined
        ? t("setup.taskQueued", { status: task.status })
        : t("setup.sessionTurns", {
            state: session.state,
            turns: String(session.usage.turns),
          }),
  };
}

export function SmokeStep({
  snapshot,
  ready,
}: {
  snapshot: Snapshot;
  ready: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const floorId = useUi((s) => s.floorId);
  const [sent, setSent] = useState<Sent | null>(null);
  const status = smokeStatus(snapshot, sent, ready, floorId, t);
  const boss = [...snapshot.agents.values()].find(
    (a) => a.role === "boss" && a.projectId === floorId,
  );
  const hello = useMutation({
    mutationFn: (projectId: ProjectId) => requireClient().chat.send({ text: HELLO, projectId }),
    onSuccess: ({ message, task }) => {
      setSent({ messageId: message.id, taskId: task?.id ?? null, at: message.at });
    },
  });
  const send = (): void => {
    if (floorId !== null && !hello.isPending) {
      hello.mutate(floorId);
    }
  };
  const reply = sent === null || floorId === null ? null : replyTo(snapshot, sent, floorId);
  return (
    <Step index={4} title={t("setup.smokeTest")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-gray-300">
          {t("setup.smokeIntro", {
            boss: boss?.name ?? t("setup.theBoss"),
            model: boss?.model ?? t("setup.bossModel"),
          })}
        </p>
        {reply !== null ? (
          <blockquote className="rounded-md border border-line bg-ink p-3 leading-relaxed text-gray-200">
            {reply}
          </blockquote>
        ) : (
          <Button
            variant="primary"
            disabled={
              hello.isPending ||
              !ready ||
              floorId === null ||
              (sent !== null && status.state === "unknown")
            }
            onClick={send}
          >
            {sent === null ? t("setup.sayHello") : t("setup.tryAgain")}
          </Button>
        )}
        {hello.error === null ? null : <p className="text-red-400">{errorMessage(hello.error)}</p>}
      </div>
    </Step>
  );
}
