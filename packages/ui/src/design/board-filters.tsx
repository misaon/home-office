import { MONO, pill } from "./tokens.ts";
import { countBy, useDesign, useFloor } from "./store.ts";

const FILTERS = [
  ["all", "All", null],
  ["running", "In progress", "var(--a,#FFC531)"],
  ["blocked", "Blocked", "#FF9E9E"],
  ["done", "Done", "#5BD9A0"],
] as const;

const CHIP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "6px 11px",
  borderRadius: "99px",
  cursor: "pointer",
  fontSize: "12px",
  transition: "all .22s cubic-bezier(.2,.8,.3,1)",
};

/** Which lanes the board is showing, each with how many cards it holds. */
export function BoardFilters(): React.JSX.Element {
  const floor = useFloor();
  const boardFilter = useDesign((s) => s.boardFilter);
  const set = useDesign((s) => s.set);
  const cards = floor.cards;

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {FILTERS.map(([key, label, dot]) => {
        const tone = pill(boardFilter === key);
        return (
          <button
            type="button"
            key={key}
            onClick={() => {
              set({ boardFilter: key });
            }}
            style={{ ...CHIP, border: `1px solid ${tone.bd}`, background: tone.bg, color: tone.fg }}
            className="hop4"
          >
            {dot === null ? null : (
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot }} />
            )}
            <span>{label}</span>
            <span style={{ ...MONO, fontSize: "10.5px", opacity: ".75" }}>
              {key === "all" ? cards.length : countBy(cards, key)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
