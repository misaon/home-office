import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { UsageMenu, useContextFill } from "./chat-usage-menu.tsx";
import type { Floor } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const SQUARE: React.CSSProperties = {
  width: "28px",
  height: "28px",
  display: "grid",
  placeItems: "center",
  border: "1px solid #2C2C32",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "all .25s",
  background: "transparent",
  color: "#CFCCC6",
};

const METER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  height: "28px",
  padding: "0 10px",
  border: "1px solid #2C2C32",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "all .2s",
};

const SEND: React.CSSProperties = {
  width: "32px",
  height: "32px",
  flex: "0 0 32px",
  display: "grid",
  placeItems: "center",
  border: "0",
  borderRadius: "10px",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  cursor: "pointer",
  transition: "all .22s cubic-bezier(.2,.8,.3,1)",
};

/** What sits on the composer's bottom edge: attach, what it costs, and send. */
export function ChatToolbar({
  floor,
  onSend,
  onAttach,
}: {
  floor: Floor;
  onSend: () => void;
  onAttach: (file: File) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const usageOpen = useDesign((s) => s.usageOpen);
  const update = useDesign((s) => s.update);
  const file = useRef<HTMLInputElement>(null);
  const fill = useContextFill(floor.id);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <input
        ref={file}
        type="file"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen !== undefined) {
            onAttach(chosen);
          }
        }}
      />
      <button
        type="button"
        aria-label={t("chat.attach")}
        title={t("chat.attach")}
        onClick={() => {
          file.current?.click();
        }}
        style={SQUARE}
        className="ho-c09931"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </button>
      <div style={{ flex: "1" }} />
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <button
          type="button"
          onClick={() => {
            update((s) => ({ usageOpen: !s.usageOpen, attachOpen: false, openSelect: null }));
          }}
          title={t("usage.chipTitle")}
          style={{
            ...METER,
            background: usageOpen ? "rgba(255,197,49,.14)" : "transparent",
            color: usageOpen ? "#FFD666" : "#CFCCC6",
          }}
          className="ho-96ee65"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="2.5" y1="11" x2="2.5" y2="7" />
            <line x1="7" y1="11" x2="7" y2="3.5" />
            <line x1="11.5" y1="11" x2="11.5" y2="5.5" />
          </svg>
          <span style={{ ...MONO, fontSize: "10.5px" }}>
            {fill === null ? "—" : `${String(Math.max(1, Math.round(fill * 100)))}%`}
          </span>
        </button>
        {usageOpen ? <UsageMenu floorId={floor.id} /> : null}
      </div>
      <button
        type="button"
        aria-label={t("chat.sendHint")}
        onClick={onSend}
        style={SEND}
        className="ho-db3c3e"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <line x1="7" y1="11.5" x2="7" y2="2.5" />
          <polyline points="3,6.5 7,2.5 11,6.5" />
        </svg>
      </button>
    </div>
  );
}
