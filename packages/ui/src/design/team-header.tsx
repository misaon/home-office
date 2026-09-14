import { DISPLAY, MONO, pill } from "./tokens.ts";
import { useDesign, useFloor } from "./store.ts";

const FILTERS = [
  ["all", "All", null],
  ["working", "Working", "var(--a,#FFC531)"],
  ["idle", "Idle", "#8E8B85"],
] as const;

const TOP: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "14px",
};

const COUNT: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "30px",
  letterSpacing: "-.02em",
  lineHeight: "1",
  whiteSpace: "nowrap",
};

const LABEL: React.CSSProperties = {
  fontSize: "11.5px",
  color: "#ABA8A1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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

/** How many people are on the floor, the button that hires another, and the three filters. */
export function TeamHeader({ onToggleAdd }: { onToggleAdd: () => void }): React.JSX.Element {
  const floor = useFloor();
  const teamFilter = useDesign((s) => s.teamFilter);
  const addAgent = useDesign((s) => s.addAgent);
  const set = useDesign((s) => s.set);
  const team = floor.team;

  return (
    <div
      style={{ padding: "16px 16px 14px", borderBottom: "1px solid #1B1B1F", marginBottom: "16px" }}
    >
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
          <span style={COUNT}>{team.length}</span>
          <span
            style={LABEL}
          >{`${team.length === 1 ? "agent on " : "agents on "}${floor.name}`}</span>
        </div>
        <button
          type="button"
          onClick={onToggleAdd}
          style={{
            padding: "6px 11px",
            borderRadius: "9px",
            border: `1px solid ${addAgent ? "rgba(255,197,49,.45)" : "#2C2C32"}`,
            background: addAgent ? "rgba(255,197,49,.12)" : "transparent",
            fontSize: "11.5px",
            color: addAgent ? "#FFD666" : "#CFCCC6",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
            transition: "all .2s",
          }}
          className="hopi"
        >
          {addAgent ? "Cancel" : "+ New agent"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {FILTERS.map(([key, label, dot]) => {
          const tone = pill(teamFilter === key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => {
                set({ teamFilter: key });
              }}
              style={{
                ...CHIP,
                border: `1px solid ${tone.bd}`,
                background: tone.bg,
                color: tone.fg,
              }}
              className="hop4"
            >
              {dot === null ? null : (
                <span
                  style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot }}
                />
              )}
              <span>{label}</span>
              <span style={{ ...MONO, fontSize: "10.5px", opacity: ".75" }}>
                {key === "all" ? team.length : team.filter((p) => p.status === key).length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
