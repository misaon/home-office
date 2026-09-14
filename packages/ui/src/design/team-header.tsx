import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { DISPLAY, MONO, pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

const FILTERS = [
  ["all", "team.all", null],
  ["working", "team.working", "bg-accent"],
  ["idle", "team.idle", "bg-ink-idle"],
] as const;

const TOP = "flex items-baseline justify-between gap-10 mb-14";

const COUNT = `${DISPLAY} font-bold text-30 tracking-display leading-flat whitespace-nowrap`;

const LABEL = "text-11h text-ink-label overflow-hidden text-ellipsis whitespace-nowrap";

const CHIP =
  "flex items-center gap-7 py-6 px-11 rounded-pill cursor-pointer text-12 transition-all duration-220 ease-soft";

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
  const team = floor.team;

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
      <div className="flex gap-6 flex-wrap">
        {FILTERS.map(([key, label, dot]) => {
          const tone = pill(teamFilter === key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => {
                set({ teamFilter: key });
              }}
              className={`${CHIP} ${tone} hover:-translate-y-1`}
            >
              {dot === null ? null : <span className={`w-6 h-6 rounded-half ${dot}`} />}
              <span>{t(label)}</span>
              <span className={`${MONO} text-10h opacity-75`}>
                {key === "all" ? team.length : team.filter((p) => p.status === key).length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
