import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { ChatHeader } from "./chat-header.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { MONO } from "./tokens.ts";
import { bossOf } from "./live.ts";
import { useDesign } from "./store.ts";

const LIST: React.CSSProperties = {
  flex: "1",
  minHeight: "0",
  overflowY: "auto",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "11px",
};

const BUBBLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "11px 14px",
  borderRadius: "15px 15px 15px 5px",
  background: "#141418",
  border: "1px solid #26262C",
  width: "fit-content",
  animation: "fadeUp .3s ease both",
};

const DOT: React.CSSProperties = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: "#FFC531",
};

/** Three dots and a name, for as long as somebody on this floor is actually working. */
function Working({ name }: { name: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={BUBBLE}>
      {["", ".15s ", ".3s "].map((delay) => (
        <span key={delay} style={{ ...DOT, animation: `dots 1.2s ease-in-out ${delay}infinite` }} />
      ))}
      <span style={{ ...MONO, fontSize: "10px", color: "#ABA8A1", marginLeft: "4px" }}>
        {t("chat.thinking", { name })}
      </span>
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "0",
        flex: "1",
        animation: "slideLeft .42s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      <ChatHeader
        floor={floor}
        boss={boss}
        hits={
          needle === ""
            ? ""
            : t("common.ofTotal", { shown: shown.length, total: floor.messages.length })
        }
      />
      <div ref={list} style={LIST}>
        {shown.map((m) => (
          <ChatMessage key={m.id} message={m} boss={boss?.name ?? t("chat.colleague")} />
        ))}
        {busy && boss !== undefined ? <Working name={boss.name} /> : null}
        {needle !== "" && shown.length === 0 ? (
          <div
            style={{
              padding: "22px 4px",
              textAlign: "center",
              fontSize: "12.5px",
              color: "#ABA8A1",
            }}
          >
            {t("chat.noHits")}
          </div>
        ) : null}
      </div>
      <ChatComposer floor={floor} />
    </div>
  );
}
