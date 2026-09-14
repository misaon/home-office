import { BoardCard } from "./board-card.tsx";
import { BoardHeader } from "./board-header.tsx";
import { MONO } from "./tokens.ts";
import { useDesign, useFloor } from "./store.ts";

const LANES = [
  ["running", "in progress", "var(--a,#FFC531)"],
  ["blocked", "blocked", "#FF9E9E"],
  ["done", "done", "#5BD9A0"],
] as const;

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

/** What the floor is carrying: a share finished, three lanes, and one card per task. */
export function Board(): React.JSX.Element {
  const floor = useFloor();
  const boardFilter = useDesign((s) => s.boardFilter);
  const cards = floor.cards;

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
      <BoardHeader />
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "16px" }}>
        {LANES.filter(([key]) => boardFilter === "all" || boardFilter === key).map(
          ([key, name, dot]) => {
            const items = cards.filter((x) => x.s === key);
            return (
              <div key={key} style={{ marginBottom: "18px" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}
                >
                  <span
                    style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot }}
                  />
                  <span style={RULE}>{name}</span>
                  <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
                  <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>
                    {items.length}
                  </span>
                </div>
                <div style={CARD}>
                  {items.map((card, i) => (
                    <BoardCard key={card.id} card={card} first={i === 0} stripe={dot} />
                  ))}
                  {items.length === 0 ? (
                    <div style={{ padding: "16px 13px", fontSize: "12px", color: "#A6A39C" }}>
                      Nothing in this lane.
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
