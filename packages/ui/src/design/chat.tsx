import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Floor, ThreadPick } from "./data.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { ChatHeader } from "./chat-header.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { ChatThreads } from "./chat-threads.tsx";
import { ChatTranscript } from "./chat-transcript.tsx";
import { bossOf, useFloorActivity } from "./live.ts";
import { useDesign } from "./store.ts";

const LIST = "flex-1 min-h-0 overflow-y-auto p-16 flex flex-col gap-11";

const STICK_WITHIN = 80;

export function Chat({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const boss = bossOf(floor);
  const activity = useFloorActivity(floor.id);
  const pick = useDesign((s) => s.thread);
  const active: ThreadPick | "new" =
    pick === "new" || floor.threads.some((thread) => thread.id === pick)
      ? pick
      : (floor.threads[0]?.id ?? "new");
  const inThread =
    active === "new"
      ? []
      : floor.messages.filter((message) => (message.threadId ?? "main") === active);
  const asking = inThread.filter((message) => message.asks !== undefined);
  const pending = asking.at(-1)?.asks ?? null;
  const needle = query.trim().toLowerCase();
  const shown =
    needle === "" ? inThread : inThread.filter((m) => m.text.toLowerCase().includes(needle));

  useEffect(() => {
    atBottom.current = true;
  }, [active]);

  useEffect(() => {
    const el = list.current;
    if (el === null || !atBottom.current) {
      return;
    }
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [active, shown.length, activity]);

  return (
    <div className="flex flex-col min-h-0 flex-1 animate-slide-420">
      <ChatHeader
        floor={floor}
        boss={boss}
        messages={inThread}
        active={active}
        hits={
          needle === "" ? "" : t("common.ofTotal", { shown: shown.length, total: inThread.length })
        }
      />
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_WITHIN;
        }}
        className={LIST}
      >
        {shown.map((m) => (
          <ChatMessage key={m.id} message={m} boss={boss?.name ?? t("chat.colleague")} />
        ))}
        {activity.map((one) => (
          <ChatTranscript key={one.id} activity={one} />
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
      <ChatThreads floor={floor} active={active} />
      <ChatComposer floor={floor} active={active} pending={pending} />
    </div>
  );
}
