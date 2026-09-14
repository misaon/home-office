import { useTranslation } from "react-i18next";
import { BoardCard } from "./board-card.tsx";
import { BoardHeader } from "./board-header.tsx";
import type { Floor, Lane } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const LANES = [
  ["queued", "board.inbox", "#6E6B66"],
  ["running", "board.inProgress", "var(--a,#FFC531)"],
  ["blocked", "board.blocked", "#FF9E9E"],
  ["done", "board.done", "#5BD9A0"],
] as const satisfies readonly [Lane, string, string][];

const RULE: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const CARD: React.CSSProperties = {
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
};

/** What the floor is carrying: a share finished, four lanes, and one card per task. */
export function Board({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);

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
      <BoardHeader floor={floor} />
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "16px" }}>
        {LANES.filter(([key]) => boardFilter === "all" || boardFilter === key).map(
          ([key, label, dot]) => {
            const items = floor.cards.filter((x) => x.s === key);
            return (
              <div key={key} style={{ marginBottom: "18px" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}
                >
                  <span
                    style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot }}
                  />
                  <span style={RULE}>{t(label)}</span>
                  <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
                  <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>
                    {items.length}
                  </span>
                </div>
                <div style={CARD}>
                  {items.map((card, i) => (
                    <BoardCard
                      key={card.id}
                      floor={floor}
                      card={card}
                      first={i === 0}
                      stripe={dot}
                    />
                  ))}
                  {items.length === 0 ? (
                    <div style={{ padding: "16px 13px", fontSize: "12px", color: "#A6A39C" }}>
                      {t("board.emptyLane")}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
