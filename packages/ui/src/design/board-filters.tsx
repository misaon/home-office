import { useTranslation } from "react-i18next";
import { type Chip, FilterChips } from "./filter-chips.tsx";
import type { Floor, Lane } from "./data.ts";
import { useDesign } from "./store.ts";

type Key = Lane | "all";

const FILTERS = [
  ["all", "board.all", null],
  ["running", "board.inProgress", "bg-accent"],
  ["blocked", "board.blocked", "bg-bad"],
  ["done", "board.done", "bg-good"],
] as const satisfies readonly [Key, string, string | null][];

/** Which lanes the board is showing, each with how many cards it holds. */
export function BoardFilters({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);
  const set = useDesign((s) => s.set);
  const chips: Chip<Key>[] = FILTERS.map(([key, label, dot]) => ({
    key,
    label,
    dot,
    count: key === "all" ? floor.cards.length : floor.cards.filter((c) => c.s === key).length,
  }));

  return (
    <FilterChips
      label={t("board.filters")}
      chips={chips}
      value={boardFilter}
      onPick={(key) => {
        set({ boardFilter: key });
      }}
    />
  );
}
