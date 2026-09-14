import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Card, Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { MONO, priority, separator } from "./tokens.ts";
import { bossOf } from "./live.ts";
import { useDesign } from "./store.ts";

const BODY: React.CSSProperties = { flex: "1", minWidth: "0", padding: "12px 13px" };

const TITLE: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  fontSize: "13px",
  lineHeight: "1.45",
  color: "#EFEDE8",
  textWrap: "pretty",
};

const AVATAR: React.CSSProperties = {
  width: "20px",
  height: "20px",
  flex: "0 0 20px",
  borderRadius: "7px",
  display: "grid",
  placeItems: "center",
  fontSize: "9.5px",
  fontWeight: "600",
};

const BIN: React.CSSProperties = {
  width: "20px",
  height: "20px",
  flex: "0 0 20px",
  display: "grid",
  placeItems: "center",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  color: "#8E8B85",
  cursor: "pointer",
  transition: "all .2s",
};

const META: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "8px",
  ...MONO,
  fontSize: "10px",
  color: "#A6A39C",
  flexWrap: "wrap",
};

/** One task as a row: what it is, who has it, and the bin that takes it off the board. */
export function BoardCard({
  floor,
  card,
  first,
  stripe,
}: {
  floor: Floor;
  card: Card;
  first: boolean;
  stripe: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const remove = useMutation({
    mutationFn: () => requireClient().tasks.remove({ id: card.id }),
    onError: (error: Error) => {
      flash(error.message);
    },
  });
  const mine = card.who === bossOf(floor)?.name;
  const { pFg } = priority(card.p);
  const open = (): void => {
    set({ sheet: { type: "task", id: card.id } });
  };

  return (
    <div
      // The row carries its own delete button, and a <button> may not contain another button.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      aria-label={card.t}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: "0",
        cursor: "pointer",
        borderTop: `1px solid ${separator(first)}`,
        transition: "background .2s",
      }}
      className="hopg"
    >
      <div style={{ width: "3px", flex: "0 0 3px", background: stripe }} />
      <div style={BODY}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={TITLE}>{card.t}</div>
          <span
            style={{
              ...AVATAR,
              background: mine ? "rgba(255,197,49,.18)" : "#26262C",
              color: mine ? "#FFD666" : "#D6D3CD",
            }}
          >
            <span>{card.who === "" ? "·" : card.who.charAt(0)}</span>
          </span>
          <button
            type="button"
            aria-label={t("board.remove")}
            disabled={remove.isPending}
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate();
            }}
            title={t("board.remove")}
            style={BIN}
            className="hoph"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            >
              <line x1="2" y1="3" x2="10" y2="3" />
              <path d="M3.2 3v6.4a1 1 0 0 0 1 1h3.6a1 1 0 0 0 1-1V3" />
            </svg>
          </button>
        </div>
        <div style={META}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: pFg }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "1px", background: pFg }} />
            <span>{t(`priority.${card.p}`)}</span>
          </span>
          <span style={{ opacity: ".4" }}>·</span>
          <span>{t(`taskKind.${card.k}`)}</span>
          <span style={{ opacity: ".4" }}>·</span>
          <span>{card.who === "" ? t("board.unassigned") : card.who}</span>
          <span style={{ opacity: ".4" }}>·</span>
          <span>{card.at}</span>
        </div>
      </div>
    </div>
  );
}
