import { type ChatMessage, ProjectId, type TaskId } from "@ho/protocol";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";

const authorName = (snapshot: Snapshot, message: ChatMessage): string =>
  message.author.kind === "human"
    ? "You"
    : (snapshot.agents.get(message.author.agentId)?.name ?? "agent");

type Question = { taskId: TaskId; title: string; text: string };

/** Open questions agents asked the human; answering resumes the task. */
const openQuestions = (snapshot: Snapshot): Question[] =>
  [...snapshot.tasks.values()]
    .filter((t) => t.status === "blocked")
    .flatMap((t) => {
      const question = t.notes.findLast((n) => n.kind === "question");
      const answered = t.notes.findLast((n) => n.kind === "answer");
      return question !== undefined && (answered === undefined || answered.at < question.at)
        ? [{ taskId: t.id, title: t.title, text: question.text }]
        : [];
    });

function Messages({ snapshot }: { snapshot: Snapshot }): React.JSX.Element {
  const bottom = useRef<HTMLDivElement>(null);
  const messages = snapshot.chat.slice(-200);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
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
  const chatProjectId = useUi((s) => s.chatProjectId);
  const setChatProject = useUi((s) => s.setChatProject);
  const [text, setText] = useState("");
  const [answering, setAnswering] = useState<TaskId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projects = [...snapshot.projects.values()].filter((p) => p.repo.kind !== "none");
  const questions = openQuestions(snapshot);

  const send = (): void => {
    const client = getClient();
    const body = text.trim();
    if (client === null || body === "") {
      return;
    }
    const input =
      answering === null
        ? chatProjectId === null
          ? { text: body }
          : { text: body, projectId: chatProjectId }
        : { text: body, taskId: answering };
    setText("");
    setAnswering(null);
    client.chat.send(input).then(
      () => {
        setError(null);
      },
      (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <Messages snapshot={snapshot} />
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
              <span className="text-amber-300">? {q.title}</span>
              <div className="text-gray-300">{q.text}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div className="border-t border-line p-2">
        <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
          <span>To</span>
          <select
            className="rounded bg-panel px-1 py-0.5"
            value={answering === null ? (chatProjectId ?? "") : "answer"}
            disabled={answering !== null}
            onChange={(e) => {
              setChatProject(e.target.value === "" ? null : ProjectId.parse(e.target.value));
            }}
          >
            <option value="">Boss (triage)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (new task)
              </option>
            ))}
            {answering === null ? null : <option value="answer">Answer to question</option>}
          </select>
          {error === null ? null : <span className="text-red-400">{error}</span>}
        </div>
        <textarea
          className="h-16 w-full resize-none rounded bg-panel p-2 outline-none"
          placeholder="Ask the office for something… (Enter to send, Shift+Enter for a new line)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
    </div>
  );
}
