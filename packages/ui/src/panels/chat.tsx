import { bossOf } from "@ho/core";
import type { ChatMessage, ProjectId, TaskId } from "@ho/protocol";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";

const authorName = (snapshot: Snapshot, message: ChatMessage): string =>
  message.author.kind === "human"
    ? "You"
    : (snapshot.agents.get(message.author.agentId)?.name ?? "agent");

type Question = { taskId: TaskId; title: string; text: string; asker: string };

/** Open questions colleagues on this floor asked the human; answering resumes the task. */
const openQuestions = (snapshot: Snapshot, floorId: ProjectId): Question[] =>
  [...snapshot.tasks.values()]
    .filter((t) => t.projectId === floorId && t.status === "blocked")
    .flatMap((t) => {
      const question = t.notes.findLast((n) => n.kind === "question");
      const answered = t.notes.findLast((n) => n.kind === "answer");
      if (question === undefined || (answered !== undefined && answered.at >= question.at)) {
        return [];
      }
      const asker =
        question.author.kind === "agent"
          ? (snapshot.agents.get(question.author.agentId)?.name ?? "a colleague")
          : "a colleague";
      return [{ taskId: t.id, title: t.title, text: question.text, asker }];
    });

function Messages({
  messages,
  snapshot,
}: {
  messages: ChatMessage[];
  snapshot: Snapshot;
}): React.JSX.Element {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      {messages.length === 0 ? (
        <p className="text-xs text-gray-500">
          Write to the boss of this floor. Lola brings him your message; he plans, delegates and
          reports back here.
        </p>
      ) : null}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`max-w-[92%] rounded px-2 py-1 ${
            m.author.kind === "human" ? "ml-auto bg-accent/20" : "bg-panel"
          }`}
        >
          <div className="text-[10px] text-gray-400">
            {authorName(snapshot, m)} · {new Date(m.at).toLocaleTimeString()}
          </div>
          <div className="whitespace-pre-wrap">{m.text}</div>
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}

export function ChatPanel(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState<TaskId | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (floorId === null) {
    return <p className="p-3 text-xs text-gray-400">Add a project (floor) first.</p>;
  }
  const floor = snapshot.projects.get(floorId);
  const boss = bossOf(snapshot, floorId);
  const messages = snapshot.chat.filter((m) => m.projectId === floorId).slice(-200);
  const questions = openQuestions(snapshot, floorId);
  const question = questions.find((q) => q.taskId === answering);

  const send = (): void => {
    const client = getClient();
    const body = text.trim();
    if (client === null || body === "" || sending) {
      return;
    }
    const input =
      question === undefined
        ? { text: body, projectId: floorId }
        : { text: body, taskId: question.taskId };
    setSending(true);
    client.chat.send(input).then(
      () => {
        setText((current) => (current === text ? "" : current));
        setAnswering(null);
        setSending(false);
        setError(null);
      },
      (failure: unknown) => {
        setSending(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-1 text-[11px] text-gray-400">
        Chat with <span className="text-gray-200">{boss?.name ?? "the boss"}</span>
        {floor === undefined ? "" : ` · floor ${floor.name}`}
      </div>
      <Messages messages={messages} snapshot={snapshot} />
      {questions.length > 0 ? (
        <div className="border-t border-line bg-amber-950/40 p-2 text-xs">
          {questions.map((q) => (
            <button
              key={q.taskId}
              type="button"
              className={`block w-full rounded px-2 py-1 text-left hover:bg-line ${
                answering === q.taskId ? "bg-line" : ""
              }`}
              onClick={() => {
                setAnswering(answering === q.taskId ? null : q.taskId);
              }}
            >
              <span className="text-amber-300">
                ? {q.asker} on “{q.title}”
              </span>
              <div className="text-gray-300">{q.text}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div className="border-t border-line p-2">
        {error === null ? null : (
          <p className="mb-2 rounded bg-red-950/70 px-2 py-1 text-xs text-red-200">{error}</p>
        )}
        <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
          {question === undefined ? (
            <span>To {boss?.name ?? "the boss"}</span>
          ) : (
            <>
              <span>Answer to {question.asker}</span>
              <button
                type="button"
                className="text-gray-300 hover:underline"
                onClick={() => {
                  setAnswering(null);
                }}
              >
                cancel
              </button>
            </>
          )}
        </div>
        <textarea
          aria-label="Message to the selected floor"
          maxLength={20_000}
          disabled={sending}
          className="h-16 w-full resize-none rounded bg-panel p-2 outline-none"
          placeholder={
            question === undefined
              ? "Ask the floor for something… (Enter to send, Shift+Enter for a new line)"
              : "Your answer… (Enter to send)"
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
    </div>
  );
}
