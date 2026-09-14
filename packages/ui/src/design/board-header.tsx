import { BoardFilters } from "./board-filters.tsx";
import { DISPLAY } from "./tokens.ts";
import { countBy, useDesign, useFloor } from "./store.ts";

const SEGMENT: React.CSSProperties = { transition: "width .5s cubic-bezier(.2,.9,.3,1)" };

const TOP: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "14px",
};

const SHARE: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "30px",
  letterSpacing: "-.02em",
  lineHeight: "1",
  whiteSpace: "nowrap",
};

const BAR: React.CSSProperties = {
  display: "flex",
  height: "5px",
  borderRadius: "99px",
  overflow: "hidden",
  gap: "2px",
  marginBottom: "14px",
};

const CLEAR: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: "9px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "11.5px",
  color: "#CFCCC6",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  transition: "all .2s",
};

/** How much of the floor's work is finished, and which lanes you want to look at. */
export function BoardHeader(): React.JSX.Element {
  const floor = useFloor();
  const patchCur = useDesign((s) => s.patchCur);
  const flash = useDesign((s) => s.flash);

  const cards = floor.cards;
  const total = cards.length === 0 ? 1 : cards.length;
  const share = (status: string): string =>
    `${String(Math.round((countBy(cards, status) / total) * 100))}%`;

  return (
    <div style={{ flex: "0 0 auto", padding: "16px 16px 14px", borderBottom: "1px solid #1B1B1F" }}>
      <div style={TOP}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "9px",
            minWidth: "0",
            flexWrap: "wrap",
          }}
        >
          <span style={SHARE}>{share("done")}</span>
          <span style={{ fontSize: "11.5px", color: "#ABA8A1" }}>
            {`${String(countBy(cards, "done"))} of ${String(cards.length)} tasks finished`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            patchCur({ cards: cards.filter((x) => x.s !== "done") });
            flash("Finished tasks cleared");
          }}
          style={CLEAR}
          className="hop3"
        >
          Clear finished
        </button>
      </div>
      <div style={BAR}>
        <div style={{ ...SEGMENT, background: "var(--a,#FFC531)", width: share("running") }} />
        <div style={{ ...SEGMENT, background: "#FF9E9E", width: share("blocked") }} />
        <div style={{ ...SEGMENT, background: "#5BD9A0", width: share("done") }} />
        <div style={{ background: "#1F1F24", flex: "1" }} />
      </div>
      <BoardFilters />
    </div>
  );
}
