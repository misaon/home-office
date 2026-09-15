import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { type Chip, FilterChips } from "./filter-chips.tsx";
import { DISPLAY } from "./tokens.ts";
import { useDesign } from "./store.ts";

type Key = "all" | "working" | "idle";

const FILTERS = [
  ["all", "team.all", null],
  ["working", "team.working", "bg-accent"],
  ["idle", "team.idle", "bg-ink-idle"],
] as const satisfies readonly [Key, string, string | null][];

const TOP = "flex items-baseline justify-between gap-10 mb-14";

const COUNT = `${DISPLAY} font-bold text-30 tracking-display leading-flat whitespace-nowrap`;

const LABEL = "text-11h text-ink-label overflow-hidden text-ellipsis whitespace-nowrap";

/** How many people are on the floor, the button that hires another, and the three filters. */
export function TeamHeader({
  floor,
  onHire,
}: {
  floor: Floor;
  onHire: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const teamFilter = useDesign((s) => s.teamFilter);
  const set = useDesign((s) => s.set);
  const { team } = floor;
  const chips: Chip<Key>[] = FILTERS.map(([key, label, dot]) => ({
    key,
    label,
    dot,
    count: key === "all" ? team.length : team.filter((p) => p.status === key).length,
  }));

  return (
    <div className="pt-16 px-16 pb-14 border-b border-line mb-16">
      <div className={TOP}>
        <div className="flex items-baseline gap-9 min-w-0 flex-wrap">
          <span className={COUNT}>{team.length}</span>
          <span
            className={LABEL}
          >{`${team.length === 1 ? "agent on " : "agents on "}${floor.name}`}</span>
        </div>
        <button
          type="button"
          onClick={onHire}
          className="hover:border-accent-a50 py-6 px-11 rounded-9 border border-border-strong bg-transparent text-11h text-ink-quiet cursor-pointer whitespace-nowrap flex-[0_0_auto] transition-all duration-200"
        >
          {t("team.newAgent")}
        </button>
      </div>
      <FilterChips
        label={t("team.filters")}
        chips={chips}
        value={teamFilter}
        onPick={(key) => {
          set({ teamFilter: key });
        }}
      />
    </div>
  );
}
