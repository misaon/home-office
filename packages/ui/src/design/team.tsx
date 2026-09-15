import { useTranslation } from "react-i18next";
import type { Floor, Member } from "./data.ts";
import { newDraft } from "./agent-dialog.tsx";
import { Plus } from "./icons.tsx";
import { TeamHeader } from "./team-header.tsx";
import { TeamRow } from "./team-row.tsx";
import { useDesign } from "./store.ts";

const LIST = "rounded-14 bg-card border border-edge overflow-hidden mb-12";

const HIRE =
  "w-full flex items-center justify-center gap-8 p-11 rounded-12 border border-dashed border-accent-a40 bg-accent-a07 text-accent-soft text-12h font-medium cursor-pointer mb-14 transition-all duration-220";

/** Who is on this floor, what each of them is doing, and the door to hiring another. */
export function Team({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const teamFilter = useDesign((s) => s.teamFilter);
  const set = useDesign((s) => s.set);

  const team = floor.team;
  const rows = team.filter((p) => teamFilter === "all" || p.status === teamFilter);
  const hire = (): void => {
    set({
      agentDlg: { mode: "new" },
      agentDraft: newDraft(team.some((p) => p.role === "boss")),
      popover: null,
    });
  };
  const open = (person: Member): void => {
    set({
      sheet: { type: "agent", id: person.id },
      sheetDraft: { ...person },
      popover: null,
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
