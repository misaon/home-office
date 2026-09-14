import { useTranslation } from "react-i18next";
import type { Floor, Member } from "./data.ts";
import { newDraft } from "./agent-dialog.tsx";
import { TeamHeader } from "./team-header.tsx";
import { TeamRow } from "./team-row.tsx";
import { useDesign } from "./store.ts";

const LIST: React.CSSProperties = {
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
  marginBottom: "12px",
};

const HIRE: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "11px",
  borderRadius: "12px",
  border: "1px dashed rgba(255,197,49,.4)",
  background: "rgba(255,197,49,.07)",
  color: "#FFD666",
  fontSize: "12.5px",
  fontWeight: "500",
  cursor: "pointer",
  marginBottom: "14px",
  transition: "all .22s",
};

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
      openSelect: null,
    });
  };
  const open = (person: Member): void => {
    set({
      sheet: { type: "agent", id: person.id },
      sheetDraft: { ...person },
      openSelect: null,
    });
  };

  return (
    <div
      style={{
        flex: "1",
        minHeight: "0",
        overflowY: "auto",
        animation: "slideLeft .42s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      <TeamHeader floor={floor} onHire={hire} />
      <div style={{ padding: "0 16px 16px" }}>
        <div style={LIST}>
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
            <div style={{ padding: "16px 13px", fontSize: "12px", color: "#A6A39C" }}>
              {t("team.empty")}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={hire} style={HIRE} className="ho-4ede91">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <line x1="6" y1="2" x2="6" y2="10" />
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
          <span>{t("team.hire")}</span>
        </button>
      </div>
    </div>
  );
}
