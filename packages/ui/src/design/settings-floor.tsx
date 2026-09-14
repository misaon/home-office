import type { Floor } from "./data.ts";
import { PullRequestToggle } from "./settings-pr.tsx";
import { IntakeSections } from "./settings-intake.tsx";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

const CHEVRON = {
  width: 9,
  height: 9,
  viewBox: "0 0 12 12",
  fill: "none",
  stroke: "#A6A39C",
  strokeWidth: "1.5",
  strokeLinecap: "round",
} as const;

const HEAD: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "13px",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition: "background .2s",
};

const BADGE: React.CSSProperties = {
  width: "20px",
  height: "20px",
  flex: "0 0 20px",
  borderRadius: "6px",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "10.5px",
};

const NAME: React.CSSProperties = {
  display: "block",
  ...MONO,
  fontSize: "12.5px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const PATH: React.CSSProperties = {
  ...MONO,
  fontSize: "10.5px",
  color: "#A6A39C",
  marginBottom: "14px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const REMOVE: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "9px",
  border: "1px solid rgba(255,122,122,.3)",
  background: "rgba(255,122,122,.1)",
  color: "#FFB3B3",
  fontSize: "11.5px",
  cursor: "pointer",
  transition: "all .2s",
};

/** One floor in Settings: where it lives, how finished work leaves it, and what feeds it. */
export function SettingsFloor({
  floor,
  index,
  first,
}: {
  floor: Floor;
  index: number;
  first: boolean;
}): React.JSX.Element {
  const floorSel = useDesign((s) => s.floorSel);
  const floorRowOpen = useDesign((s) => s.floorRowOpen);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);
  const current = index === floorSel;
  const open = floorRowOpen === index;
  const openTasks = floor.cards.filter((x) => x.s !== "done").length;

  return (
    <div
      style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${separator(first)}` }}
    >
      <div
        style={{
          width: "3px",
          flex: "0 0 3px",
          background: current ? "var(--a,#FFC531)" : "#2C2C32",
        }}
      />
      <div style={{ flex: "1", minWidth: "0" }}>
        <button
          type="button"
          onClick={() => {
            update((s) => ({ floorRowOpen: s.floorRowOpen === index ? null : index }));
          }}
          style={HEAD}
          className="hopg"
        >
          <span
            style={{
              ...BADGE,
              background: current ? "var(--a,#FFC531)" : "#24242A",
              color: current ? "#150F02" : "#BEBBB4",
            }}
          >
            <span>{index + 1}</span>
          </span>
          <span style={{ flex: "1", minWidth: "0" }}>
            <span style={NAME}>{floor.name}</span>
            <span
              style={{ display: "block", fontSize: "10.5px", color: "#A6A39C", marginTop: "4px" }}
            >
              {`${String(floor.team.length)}${floor.team.length === 1 ? " agent · " : " agents · "}${String(openTasks)} open tasks`}
            </span>
          </span>
          <svg
            style={{
              flex: "0 0 auto",
              transition: "transform .3s",
              transform: `rotate(${open ? "90deg" : "0deg"})`,
            }}
            {...CHEVRON}
          >
            <polyline points="4.5,3 8,6 4.5,9" />
          </svg>
        </button>
        {open ? (
          <div style={{ padding: "0 13px 14px", animation: "riseIn .28s ease both" }}>
            <div style={PATH}>{floor.path}</div>
            <PullRequestToggle floor={floor} index={index} />
            <div style={{ height: "1px", background: "#232328", margin: "14px 0" }} />
            <IntakeSections floor={floor} index={index} />
            <div style={{ height: "1px", background: "#1F1F24", margin: "14px 0" }} />
            <button
              type="button"
              onClick={() => {
                update((s) => ({
                  floors: s.floors.filter((_, n) => n !== index),
                  floorSel: 0,
                  floorRowOpen: 0,
                }));
                flash(`${floor.name} removed`);
              }}
              style={REMOVE}
              className="hopp"
            >
              Remove this floor
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
