import { chatOf } from "@ho/core";
import type { ChatMessage, ProjectId, TaskId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Failure } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { bossOnFloor, type Snapshot, useUi } from "../store.ts";
import { SetupStep, type StepStatus } from "./step.tsx";

const HELLO =
  "Hello! This is the first-run check of Home Office. Reply with one short sentence confirming you are online; do not delegate anything.";

type Sent = { taskId: TaskId | null; at: string };

/** The boss's answer to the hello: an agent's message on that task, written after it was sent. */
const replyTo = (chat: Snapshot["chat"], sent: Sent, floorId: ProjectId): ChatMessage | undefined =>
  chatOf({ chat }, floorId).find(
    (m) => m.author.kind === "agent" && m.taskId === sent.taskId && m.at >= sent.at,
  );

const secondsBetween = (from: string, to: string): string =>
  String(Math.round((Date.parse(to) - Date.parse(from)) / 1000));

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
  const reply = replyTo(snapshot.chat, sent, floorId);
  if (reply !== undefined) {
    return {
      state: "ok",
      text: t("setup.bossAnswered", { seconds: secondsBetween(sent.at, reply.at) }),
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

export function SmokeStep({ ready }: { ready: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  const [sent, setSent] = useState<Sent | null>(null);
  const status = smokeStatus(snapshot, sent, ready, floorId, t);
  const boss = floorId === null ? undefined : bossOnFloor(snapshot.agents, floorId);
  const hello = useMutation({
    mutationFn: (projectId: ProjectId) => requireClient().chat.send({ text: HELLO, projectId }),
    onSuccess: ({ message, task }) => {
      setSent({ taskId: task?.id ?? null, at: message.at });
    },
  });
  const send = (): void => {
    if (floorId !== null && !hello.isPending) {
      hello.mutate(floorId);
    }
  };
  const reply =
    sent === null || floorId === null ? undefined : replyTo(snapshot.chat, sent, floorId);
  return (
    <SetupStep index={4} title={t("setup.smokeTest")} status={status}>
      <div className="space-y-3">
        <p className="leading-relaxed text-gray-300">
          {t("setup.smokeIntro", {
            boss: boss?.name ?? t("setup.theBoss"),
            model: boss?.model ?? t("setup.bossModel"),
          })}
        </p>
        {reply !== undefined ? (
          <blockquote className="rounded-md border border-line bg-ink p-3 leading-relaxed text-gray-200">
            {reply.text}
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
        <Failure error={hello.error} />
      </div>
    </SetupStep>
  );
}
