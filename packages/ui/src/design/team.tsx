import { type Floor, type Member } from "./data.ts";
import { useTranslation } from "react-i18next";
import { newDraft } from "./agent-dialog.tsx";
import { Plus } from "lucide-react";
import { TeamRow } from "./team-row.tsx";
import { useDesign } from "./store.ts";
import { type Chip, FilterChips } from "./filter-chips.tsx";
import { DISPLAY } from "./tokens.ts";

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
function TeamHeader({ floor, onHire }: { floor: Floor; onHire: () => void }): React.JSX.Element {
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

const LIST = "rounded-14 bg-card border border-edge overflow-hidden mb-12";

const HIRE =
  "w-full flex items-center justify-center gap-8 p-11 rounded-12 border border-dashed border-accent-a40 bg-accent-a07 text-accent-soft text-12h font-medium cursor-pointer mb-14 transition-all duration-220";

/** Who is on this floor, what each of them is doing, and the door to hiring another. */
export function Team({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const teamFilter = useDesign((s) => s.teamFilter);
  const set = useDesign((s) => s.set);

  const { team } = floor;
  const rows = team.filter((p) => teamFilter === "all" || p.status === teamFilter);
  const hire = (): void => {
    set({
      agentDlg: { mode: "new" },
      agentDraft: newDraft(team.some((p) => p.role === "boss")),
    });
  };
  const open = (person: Member): void => {
    set({
      sheet: { type: "agent", id: person.id },
      sheetDraft: { ...person },
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-slide-420">
      <TeamHeader floor={floor} onHire={hire} />
      <div className="pt-0 px-16 pb-16">
        <div className={LIST}>
          {rows.map((person, n) => (
            <TeamRow
              key={person.name}
              person={person}
              first={n === 0}
              onOpen={() => {
                open(person);
              }}
            />
          ))}
          {rows.length === 0 ? (
            <div className="py-16 px-13 text-12 text-ink-meta">{t("team.empty")}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={hire}
          className={`hover:bg-accent-a14 hover:border-accent-a65 ${HIRE}`}
        >
          <Plus size={12} strokeWidth={1.6} />
          <span>{t("team.hire")}</span>
        </button>
      </div>
    </div>
  );
}
