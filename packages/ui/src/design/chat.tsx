import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Floor, ThreadPick } from "./data.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { useFollowLatest } from "./chat-follow.ts";
import { ChatSearch } from "./chat-search.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { ChatThreads } from "./chat-threads.tsx";
import { ChatTranscript } from "./chat-transcript.tsx";
import { bossOf, useFloorActivity } from "./live.ts";
import { useThreadRequests } from "./live-mandates.ts";
import { RequestCard } from "./request-card.tsx";
import { useDesign } from "./store.ts";

const LIST = "flex-1 min-h-0 overflow-y-auto p-16 flex flex-col gap-11";

const JUMP =
  "absolute -top-38 right-16 py-6 px-11 rounded-pill border border-accent-a45 bg-toast text-11 text-accent-quote shadow-toast cursor-pointer transition-all duration-200 animate-rise-240";

const ANNOUNCEMENT_GRACE_MS = 1500;

const afterAnnouncement = (iso: string): string =>
  new Date(new Date(iso).getTime() + ANNOUNCEMENT_GRACE_MS).toISOString();

export function Chat({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const searchOpen = useDesign((s) => s.searchOpen);
  const set = useDesign((s) => s.set);
  const boss = bossOf(floor);
  const pick = useDesign((s) => s.thread);
  const active: ThreadPick | "new" =
    pick === "new" || floor.threads.some((thread) => thread.id === pick)
      ? pick
      : (floor.threads[0]?.id ?? "new");
  const activity = useFloorActivity(floor.id, active);
  const requests = useThreadRequests(floor.id, active);
  const inThread =
    active === "new"
      ? []
      : floor.messages.filter((message) => (message.threadId ?? "main") === active);
  const asking = inThread.filter((message) => message.asks !== undefined);
  const pending = asking.at(-1)?.asks ?? null;
  const needle = query.trim().toLowerCase();
  const shown =
    needle === "" ? inThread : inThread.filter((m) => m.text.toLowerCase().includes(needle));
  const timeline = [
    ...shown.map((message) => ({ key: message.id, at: message.at, order: 0, message })),
    ...(needle === "" ? activity : []).map((one) => ({
      key: one.sessionId,
      at: afterAnnouncement(one.startedAt),
      order: 1,
      activity: one,
    })),
  ].toSorted((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

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

  const growth = `${String(shown.length)}|${activity
    .map((one) => `${one.sessionId}:${String(one.steps.length)}:${String(one.text.length)}`)
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
      {requests.length === 0 ? null : (
        <div className="px-16 pt-12 flex flex-col gap-8 flex-[0_0_auto]">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
      <div
        ref={list}
        onScroll={(e) => {
          follow.onScroll(e.currentTarget);
        }}
        className={LIST}
      >
        {timeline.map((item) =>
          "message" in item ? (
            <ChatMessage
              key={item.key}
              message={item.message}
              boss={boss?.name ?? t("chat.colleague")}
            />
          ) : (
            <ChatTranscript key={item.key} activity={item.activity} />
          ),
        )}
        {asking.length > 1 ? (
          <div className="text-10h text-warn text-center py-4">
            {t("chat.moreQuestions", { count: asking.length - 1 })}
          </div>
        ) : null}
        {needle !== "" && shown.length === 0 ? (
          <div className="py-22 px-4 text-center text-12h text-ink-label">{t("chat.noHits")}</div>
        ) : null}
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
      <ChatThreads floor={floor} active={active} />
      <ChatComposer floor={floor} active={active} pending={pending} />
    </div>
  );
}
