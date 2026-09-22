import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatComposer } from "./chat-composer.tsx";
import { useFollowLatest } from "./chat-follow.ts";
import { ChatMessage } from "./chat-message.tsx";
import { ChatNow } from "./chat-now.tsx";
import { ChatRequest } from "./chat-request.tsx";
import { ChatSearch } from "./chat-search.tsx";
import { ChatSessionCard } from "./chat-session-card.tsx";
import { ChatStatus } from "./chat-status.tsx";
import { ChatThreads } from "./chat-threads.tsx";
import { buildTimeline, type TimelineItem } from "./chat-timeline.ts";
import type { Floor, ThreadPick } from "./data.ts";
import { bossOf, useNow } from "./live.ts";
import { useThreadRequest } from "./live-mandates.ts";
import { useThreadSessions } from "./live-sessions.ts";
import { type Design, useDesign } from "./store.ts";
import { MONO } from "./tokens.ts";

const LIST = "flex-1 min-h-0 overflow-y-auto";

const ITEMS = "flex flex-col gap-10 px-16 pt-8 pb-16";

const DAY = `flex items-center gap-10 my-4 ${MONO} text-9h tracking-caps uppercase text-ink-idle before:content-[''] before:flex-1 before:h-px before:bg-line after:content-[''] after:flex-1 after:h-px after:bg-line`;

const JUMP =
  "absolute -top-38 right-16 py-6 px-11 rounded-pill border border-accent-a45 bg-toast text-11 text-accent-quote shadow-toast cursor-pointer transition-all duration-200 animate-rise-240";

const useSearchKeys = (set: Design["set"]): void => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "f" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        set({ searchOpen: true });
      }
      if (event.key === "Escape") {
        set({ searchOpen: false, query: "" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [set]);
};

function TimelineRow({ item, boss }: { item: TimelineItem; boss: string }): React.JSX.Element {
  if (item.kind === "day") {
    return <div className={DAY}>{item.label}</div>;
  }
  if (item.kind === "status") {
    return <ChatStatus message={item.message} />;
  }
  if (item.kind === "message") {
    return <ChatMessage message={item.message} boss={boss} continued={item.continued} />;
  }
  return <ChatSessionCard card={item.card} />;
}

export function Chat({ floor }: { floor: Floor }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const query = useDesign((s) => s.query);
  const searchOpen = useDesign((s) => s.searchOpen);
  const set = useDesign((s) => s.set);
  const boss = bossOf(floor);
  const pick = useDesign((s) => s.thread);
  const active: ThreadPick | "new" =
    pick === "new" || floor.threads.some((thread) => thread.id === pick)
      ? pick
      : (floor.threads[0]?.id ?? "new");
  const now = useNow();
  const cards = useThreadSessions(floor.id, active);
  const request = useThreadRequest(floor.id, active);
  const inThread =
    active === "new"
      ? []
      : floor.messages.filter((message) => (message.threadId ?? "main") === active);
  const asking = inThread.filter((message) => message.asks !== undefined);
  const pending = asking.at(-1)?.asks ?? null;
  const needle = query.trim().toLowerCase();
  const shown =
    needle === "" ? inThread : inThread.filter((m) => m.text.toLowerCase().includes(needle));
  const timeline = buildTimeline(shown, needle === "" ? cards : [], now, i18n.language, t);
  const running = cards.filter((card) => card.live);
  useSearchKeys(set);

  const growth = `${String(shown.length)}|${cards
    .map(
      (card) =>
        `${card.id}:${String(card.steps.length)}:${String(card.text.length)}:${card.activity ?? ""}`,
    )
    .join(",")}`;
  const list = useRef<HTMLDivElement>(null);
  const follow = useFollowLatest(active, growth, () => {
    const element = list.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  });

  return (
    <div className="flex flex-col min-h-0 flex-1 animate-slide-420">
      {searchOpen ? (
        <ChatSearch
          hits={
            needle === ""
              ? ""
              : t("common.ofTotal", { shown: shown.length, total: inThread.length })
          }
        />
      ) : null}
      <div
        ref={list}
        onScroll={(e) => {
          follow.onScroll(e.currentTarget);
        }}
        className={LIST}
      >
        {request === null ? null : <ChatRequest key={request.id} request={request} />}
        <div className={ITEMS}>
          {timeline.map((item) => (
            <TimelineRow key={item.key} item={item} boss={boss?.name ?? t("chat.colleague")} />
          ))}
          {asking.length > 1 ? (
            <div className="text-10h text-warn text-center py-4">
              {t("chat.moreQuestions", { count: asking.length - 1 })}
            </div>
          ) : null}
          {needle !== "" && shown.length === 0 ? (
            <div className="py-22 px-4 text-center text-12h text-ink-label">{t("chat.noHits")}</div>
          ) : null}
        </div>
      </div>
      {follow.behind ? (
        <div className="relative h-0 z-10">
          <button
            type="button"
            onClick={() => {
              follow.jump();
            }}
            className={`hover:border-accent-a70 hover:text-accent-soft ${JUMP}`}
          >
            {t("chat.jumpToLatest")}
          </button>
        </div>
      ) : null}
      <ChatNow cards={running} />
      <ChatThreads floor={floor} active={active} />
      <ChatComposer floor={floor} active={active} pending={pending} running={running[0]} />
    </div>
  );
}
