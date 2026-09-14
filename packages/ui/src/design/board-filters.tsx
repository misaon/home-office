import { useTranslation } from "react-i18next";
import type { Floor, Lane } from "./data.ts";
import { MONO, pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

const FILTERS = [
  ["all", "board.all", null],
  ["running", "board.inProgress", "var(--a,#FFC531)"],
  ["blocked", "board.blocked", "#FF9E9E"],
  ["done", "board.done", "#5BD9A0"],
] as const satisfies readonly [Lane | "all", string, string | null][];

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
export function BoardFilters({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);
  const set = useDesign((s) => s.set);

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
            <span>{t(label)}</span>
            <span style={{ ...MONO, fontSize: "10.5px", opacity: ".75" }}>
              {key === "all" ? floor.cards.length : floor.cards.filter((c) => c.s === key).length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
