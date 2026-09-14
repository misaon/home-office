import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { ChatHeader } from "./chat-header.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { MONO } from "./tokens.ts";
import { bossOf } from "./live.ts";
import { useDesign } from "./store.ts";

const LIST = "flex-1 min-h-0 overflow-y-auto p-16 flex flex-col gap-11";

const BUBBLE =
  "flex items-center gap-7 py-11 px-14 rounded-15 rounded-bl-5 bg-toast border border-border w-fit animate-lift-300";

const DOT = "w-5 h-5 rounded-half bg-accent";

/** Three dots and a name, for as long as somebody on this floor is actually working. */
function Working({ name }: { name: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={BUBBLE}>
      {["0s", ".15s", ".3s"].map((delay) => (
        <span key={delay} className={`${DOT} animate-dots wait`} style={{ "--wait": delay }} />
      ))}
      <span className={`${MONO} text-10 text-ink-label ml-4`}>{t("chat.thinking", { name })}</span>
    </div>
  );
}

/** The conversation with the floor's boss: who you are talking to, what was said, and the composer. */
export function Chat({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const list = useRef<HTMLDivElement>(null);

  const boss = bossOf(floor);
  const busy = floor.team.some((p) => p.status === "working");
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? floor.messages
      : floor.messages.filter((m) => m.text.toLowerCase().includes(needle));

  useEffect(() => {
    const el = list.current;
    if (el !== null) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  return (
    <div className="flex flex-col min-h-0 flex-1 animate-slide-420">
      <ChatHeader
        floor={floor}
        boss={boss}
        hits={
          needle === ""
            ? ""
            : t("common.ofTotal", { shown: shown.length, total: floor.messages.length })
        }
      />
      <div ref={list} className={LIST}>
        {shown.map((m) => (
          <ChatMessage key={m.id} message={m} boss={boss?.name ?? t("chat.colleague")} />
        ))}
        {busy && boss !== undefined ? <Working name={boss.name} /> : null}
        {needle !== "" && shown.length === 0 ? (
          <div className="py-22 px-4 text-center text-12h text-ink-label">{t("chat.noHits")}</div>
        ) : null}
      </div>
      <ChatComposer floor={floor} />
    </div>
  );
}
