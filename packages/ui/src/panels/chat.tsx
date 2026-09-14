import { chatOf } from "@ho/core";
import {
  type Attachment,
  type ChatSendInput,
  isSessionActive,
  type ProjectId,
  type TaskId,
} from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { requireClient } from "../rpc.ts";
import { bossOnFloor, type Snapshot, useUi } from "../store.ts";
import { Badge, Empty } from "../kit/controls.tsx";
import { Composer } from "./chat-composer.tsx";
import { Messages } from "./chat-messages.tsx";

type Question = { taskId: TaskId; title: string; text: string; asker: string };

/** Open questions colleagues on this floor asked the human; answering resumes the task. */
const openQuestions = (
  tasks: Snapshot["tasks"],
  agents: Snapshot["agents"],
  floorId: ProjectId,
  translate: TFunction,
): Question[] =>
  [...tasks.values()]
    .filter((t) => t.projectId === floorId && t.status === "blocked")
    .flatMap((t) => {
      const question = t.notes.findLast((n) => n.kind === "question");
      const answered = t.notes.findLast((n) => n.kind === "answer");
      if (question === undefined || (answered !== undefined && answered.at >= question.at)) {
        return [];
      }
      const asker =
        question.author.kind === "agent"
          ? (agents.get(question.author.agentId)?.name ?? translate("chat.colleague"))
          : translate("chat.colleague");
      return [{ taskId: t.id, title: t.title, text: question.text, asker }];
    });

function Questions({
  questions,
  answering,
  setAnswering,
}: {
  questions: Question[];
  answering: TaskId | null;
  setAnswering: (taskId: TaskId | null) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (questions.length === 0) {
    return null;
  }
  return (
    <div className="animate-rise shrink-0 space-y-1 border-t border-warn/20 bg-warn/[0.06] p-3 text-xs">
      {questions.map((q) => (
        <button
          key={q.taskId}
          type="button"
          aria-pressed={answering === q.taskId}
          className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-border/50 ${
            answering === q.taskId ? "bg-border/70" : ""
          }`}
          onClick={() => {
            setAnswering(answering === q.taskId ? null : q.taskId);
          }}
        >
          <span className="text-warn">
            {t("chat.question", { asker: q.asker, title: q.title })}
          </span>
          <div className="mt-1 text-foreground/80">{q.text}</div>
        </button>
      ))}
    </div>
  );
}

export function ChatPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const agents = useUi((s) => s.snapshot.agents);
  const tasks = useUi((s) => s.snapshot.tasks);
  const chat = useUi((s) => s.snapshot.chat);
  const sessions = useUi((s) => s.snapshot.sessions);
  const floorId = useUi((s) => s.floorId);
  const [text, setText] = useState("");
  const [answering, setAnswering] = useState<TaskId | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const send = useMutation({
    mutationFn: (input: ChatSendInput) => requireClient().chat.send(input),
    onSuccess: (_message, input) => {
      setText((current) => (current === input.text ? "" : current));
      setFiles([]);
      setAnswering(null);
    },
  });

  if (floorId === null) {
    return (
      <div className="p-4">
        <Empty>{t("project.needFirst")}</Empty>
      </div>
    );
  }
  const floor = projects.get(floorId);
  const boss = bossOnFloor(agents, floorId);
  const bossName = boss?.name ?? t("chat.theBoss");
  // The boss reads the floor's chat in a session of his own; while it runs, his answer is on its way.
  const working = [...sessions.values()].find(
    (s) => s.agentId === boss?.id && isSessionActive(s.state),
  );
  const thinking =
    boss === undefined || working === undefined ? null : { name: boss.name, sessionId: working.id };
  const questions = openQuestions(tasks, agents, floorId, t);
  const question = questions.find((q) => q.taskId === answering);

  const submit = (): void => {
    const body = text.trim();
    if (body === "" || send.isPending) {
      return;
    }
    send.mutate(
      question === undefined
        ? { text: body, projectId: floorId, attachments: files }
        : { text: body, taskId: question.taskId, attachments: files },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-xs text-foreground/80">
        <span>{t("chat.with")}</span>
        <span className="font-medium text-foreground">{bossName}</span>
        {floor === undefined ? null : <Badge>{floor.name}</Badge>}
      </div>
      <Messages messages={chatOf({ chat }, floorId)} agents={agents} thinking={thinking} />
      <Questions questions={questions} answering={answering} setAnswering={setAnswering} />
      <Composer
        to={
          question === undefined ? null : (
            <>
              <span>{t("chat.answerTo", { name: question.asker })}</span>
              <button
                type="button"
                className="text-foreground/80 hover:underline"
                onClick={() => {
                  setAnswering(null);
                }}
              >
                {t("chat.cancelAnswer")}
              </button>
            </>
          )
        }
        placeholder={question === undefined ? t("chat.placeholder") : t("chat.answerPlaceholder")}
        text={text}
        setText={setText}
        files={files}
        setFiles={setFiles}
        disabled={send.isPending}
        failure={send.error}
        submit={submit}
      />
    </div>
  );
}
