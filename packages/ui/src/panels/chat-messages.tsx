import {
  type Agent,
  type ChatMessage,
  type LiveEvent,
  PROVIDERS,
  type SessionId,
} from "@ho/protocol";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Empty } from "../kit/controls.tsx";
import { type Snapshot, useUi } from "../store.ts";
import { MessageFiles } from "./chat-files.tsx";

const authorName = (
  agents: Snapshot["agents"],
  message: ChatMessage,
  translate: TFunction,
): string =>
  message.author.kind === "human"
    ? translate("chat.you")
    : (agents.get(message.author.agentId)?.name ?? translate("chat.agent"));

const CHIP =
  "rounded-md border border-border bg-background/60 px-1.5 py-px font-mono text-2xs text-foreground/80";

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

const DOT = "h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70";

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
    <div className="animate-rise max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-secondary px-3.5 py-2.5 text-sm shadow-card">
      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
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
        <div className="mt-1.5 truncate font-mono text-2xs text-muted-foreground">{activity}</div>
      )}
    </div>
  );
}

export function Messages({
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
      {messages.map((m, i) => {
        // What you said is gold and what the floor answered is grey, so a glance down the column reads
        // as a conversation before a single word of it is read. The gold is a tint rather than the
        // colour itself: solid accent won the glance and lost the reading.
        const mine = m.author.kind === "human";
        return (
          <div
            key={m.id}
            className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm shadow-card ring-1 ring-white/[0.04] ring-inset ${
              i < backlog ? "" : "animate-rise"
            } ${
              mine
                ? "ml-auto rounded-br-md border border-primary/40 bg-primary/20"
                : "rounded-bl-md border border-input bg-secondary"
            }`}
          >
            <div
              className={`mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs ${
                mine ? "text-primary/80" : "text-muted-foreground"
              }`}
            >
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
        );
      })}
      {thinking === null ? null : <Thinking name={thinking.name} sessionId={thinking.sessionId} />}
      <div ref={bottom} />
    </div>
  );
}
