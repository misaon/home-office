import { useTranslation } from "react-i18next";
import type { Floor, Lane } from "./data.ts";
import { MONO, pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

const FILTERS = [
  ["all", "board.all", null],
  ["running", "board.inProgress", "bg-accent"],
  ["blocked", "board.blocked", "bg-bad"],
  ["done", "board.done", "bg-good"],
] as const satisfies readonly [Lane | "all", string, string | null][];

const CHIP =
  "flex items-center gap-7 py-6 px-11 rounded-pill cursor-pointer text-12 transition-all duration-220 ease-soft";

/** Which lanes the board is showing, each with how many cards it holds. */
export function BoardFilters({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);
  const set = useDesign((s) => s.set);

  return (
    <div className="flex gap-6 flex-wrap">
      {FILTERS.map(([key, label, dot]) => {
        const tone = pill(boardFilter === key);
        return (
          <button
            type="button"
            key={key}
            onClick={() => {
              set({ boardFilter: key });
            }}
            className={`${CHIP} ${tone} hover:-translate-y-1`}
          >
            {dot === null ? null : <span className={`w-6 h-6 rounded-half ${dot}`} />}
            <span>{t(label)}</span>
            <span className={`${MONO} text-10h opacity-75`}>
              {key === "all" ? floor.cards.length : floor.cards.filter((c) => c.s === key).length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
