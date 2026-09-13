import { chatOf } from "@ho/core";
import {
  type Agent,
  type Attachment,
  type ChatMessage,
  type ChatSendInput,
  isSessionActive,
  type LiveEvent,
  type ProjectId,
  PROVIDERS,
  type SessionId,
  type TaskId,
} from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { requireClient } from "../rpc.ts";
import { bossOnFloor, type Snapshot, useUi } from "../store.ts";
import { Badge, Empty } from "../kit/controls.tsx";
import { Composer } from "./chat-composer.tsx";
import { MessageFiles } from "./chat-files.tsx";

const authorName = (
  agents: Snapshot["agents"],
  message: ChatMessage,
  translate: TFunction,
): string =>
  message.author.kind === "human"
    ? translate("chat.you")
    : (agents.get(message.author.agentId)?.name ?? translate("chat.agent"));

const CHIP = "rounded-md border border-line bg-ink/60 px-1.5 py-px font-mono text-2xs text-muted";

/** What the colleague who wrote this runs on; the effort level only where the provider offers one. */
function AgentChips({ agent }: { agent: Agent | undefined }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (agent === undefined) {
    return null;
  }
  return (
    <>
      <span className={CHIP} title={t("agent.model")}>
        {agent.model}
      </span>
      {PROVIDERS[agent.provider].effortLevels.length === 0 ? null : (
        <span className={CHIP} title={t("agent.effort")}>
          {agent.effort}
        </span>
      )}
    </>
  );
}

const DOT = "h-1.5 w-1.5 animate-bounce rounded-full bg-accent/70";

/** What the colleague is doing right now, when the live stream says something worth a word. */
const activityOf = (events: readonly LiveEvent[] | undefined, t: TFunction): string | null => {
  const last = events?.findLast((l) => l.event.kind === "tool_call");
  return last === undefined || last.event.kind !== "tool_call"
    ? null
    : t("chat.thinkingTool", { name: last.event.name });
};

/**
 * The boss is working on this floor right now: a bubble with three dots where his answer will appear, so
 * a wait of half a minute does not look like nothing happening.
 */
function Thinking({ name, sessionId }: { name: string; sessionId: SessionId }): React.JSX.Element {
  const { t } = useTranslation();
  const activity = activityOf(
    useUi((s) => s.live.get(sessionId)),
    t,
  );
  return (
    <div className="animate-rise max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-raised px-3.5 py-2.5 text-sm shadow-card">
      <div className="flex items-center gap-2 text-2xs text-faint">
        <span>
          {name} {t("chat.thinking")}
        </span>
        <span className="flex items-center gap-1">
          <span className={DOT} />
          <span className={`${DOT} [animation-delay:150ms]`} />
          <span className={`${DOT} [animation-delay:300ms]`} />
        </span>
      </div>
      {activity === null ? null : (
        <div className="mt-1.5 truncate font-mono text-2xs text-faint">{activity}</div>
      )}
    </div>
  );
}

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

function Messages({
  messages,
  agents,
  thinking,
}: {
  messages: readonly ChatMessage[];
  agents: Snapshot["agents"];
  thinking: { name: string; sessionId: SessionId } | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const bottom = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);
  const waiting = thinking !== null;
  /** The history is already there when the panel opens, so it belongs at the end at once; what arrives
   * afterwards is news, and news is worth watching travel. */
  const [backlog] = useState(messages.length);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: arrived.current ? "smooth" : "auto" });
    arrived.current = true;
  }, [messages.length, waiting]);
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 ? <Empty>{t("chat.empty")}</Empty> : null}
      {messages.map((m, i) => (
        <div
          key={m.id}
          className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm shadow-card ring-1 ring-white/[0.03] ring-inset ${
            i < backlog ? "" : "animate-rise"
          } ${
            m.author.kind === "human"
              ? "ml-auto rounded-br-md border border-accent/25 bg-accent/12"
              : "rounded-bl-md border border-line bg-raised"
          }`}
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-faint">
            <span>
              {authorName(agents, m, t)} · {new Date(m.at).toLocaleTimeString()}
            </span>
            <AgentChips
              agent={m.author.kind === "agent" ? agents.get(m.author.agentId) : undefined}
            />
          </div>
          <div className="whitespace-pre-wrap">{m.text}</div>
          <MessageFiles attachments={m.attachments} />
        </div>
      ))}
      {thinking === null ? null : <Thinking name={thinking.name} sessionId={thinking.sessionId} />}
      <div ref={bottom} />
    </div>
  );
}

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
          className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-line/50 ${
            answering === q.taskId ? "bg-line/70" : ""
          }`}
          onClick={() => {
            setAnswering(answering === q.taskId ? null : q.taskId);
          }}
        >
          <span className="text-warn">
            {t("chat.question", { asker: q.asker, title: q.title })}
          </span>
          <div className="mt-1 text-muted">{q.text}</div>
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
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 text-xs text-muted">
        <span>{t("chat.with")}</span>
        <span className="font-medium text-text">{bossName}</span>
        {floor === undefined ? null : <Badge>{floor.name}</Badge>}
      </div>
      <Messages messages={chatOf({ chat }, floorId)} agents={agents} thinking={thinking} />
      <Questions questions={questions} answering={answering} setAnswering={setAnswering} />
      <Composer
        to={
          question === undefined ? (
            <span>{t("chat.to", { name: bossName })}</span>
          ) : (
            <>
              <span>{t("chat.answerTo", { name: question.asker })}</span>
              <button
                type="button"
                className="text-muted hover:underline"
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
