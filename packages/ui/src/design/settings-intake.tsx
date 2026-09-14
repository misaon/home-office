import type { Floor } from "./data.ts";
import { MONO } from "./tokens.ts";
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

const DRAWER: React.CSSProperties = {
  marginTop: "11px",
  padding: "12px",
  borderRadius: "11px",
  background: "#0A0A0C",
  border: "1px solid #26262C",
  animation: "riseIn .3s ease both",
};

const BLURB: React.CSSProperties = {
  fontSize: "11.5px",
  color: "#A6A39C",
  lineHeight: "1.6",
  marginBottom: "10px",
};

/** A heading that is also the handle: what the section is, whether it is on, and which way it points. */
function Disclosure({
  label,
  state,
  open,
  padding,
  onToggle,
}: {
  label: string;
  state: string;
  open: boolean;
  padding: string;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding,
        cursor: "pointer",
        border: "0",
        background: "transparent",
        textAlign: "left",
      }}
    >
      <span
        style={{
          ...MONO,
          fontSize: "10px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#ABA8A1",
        }}
      >
        {label}
      </span>
      <span
        style={{
          ...MONO,
          fontSize: "10px",
          padding: "2px 7px",
          borderRadius: "5px",
          background: "#24242A",
          color: "#BEBBB4",
        }}
      >
        {state}
      </span>
      <div style={{ flex: "1" }} />
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
  );
}

/** What feeds a floor and what it may start: issues arriving as mail, and per-task services. */
export function IntakeSections({
  floor,
  index,
}: {
  floor: Floor;
  index: number;
}): React.JSX.Element {
  const patchFloor = useDesign((s) => s.patchFloor);
  const flash = useDesign((s) => s.flash);
  return (
    <>
      <Disclosure
        label="github issues → mail"
        state={floor.issues ? "on" : "off"}
        open={floor.issuesOpen}
        padding="4px 0"
        onToggle={() => {
          patchFloor(index, { issuesOpen: !floor.issuesOpen });
        }}
      />
      {floor.issuesOpen ? (
        <div style={DRAWER}>
          <div style={BLURB}>
            New issues arrive as mail on the floor, so the boss can triage them into tasks.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              placeholder="owner/repo"
              style={{
                flex: "1",
                minWidth: "0",
                padding: "9px 11px",
                borderRadius: "9px",
                border: "1px solid #2C2C32",
                background: "#111114",
                ...MONO,
                fontSize: "11.5px",
              }}
            />
            <button
              type="button"
              onClick={() => {
                patchFloor(index, { issues: true });
                flash(`Issue intake on for ${floor.name}`);
              }}
              style={{
                padding: "9px 13px",
                borderRadius: "9px",
                border: "0",
                background: "var(--a,#FFC531)",
                color: "#150F02",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Turn on
            </button>
          </div>
        </div>
      ) : null}
      <Disclosure
        label="task services"
        state={floor.services ? "on" : "off"}
        open={floor.servicesOpen}
        padding="12px 0 4px"
        onToggle={() => {
          patchFloor(index, { servicesOpen: !floor.servicesOpen });
        }}
      />
      {floor.servicesOpen ? (
        <div style={DRAWER}>
          <div style={BLURB}>
            Each task can start its own Docker engine — databases, queues and test services live and
            die with the task.
          </div>
          <button
            type="button"
            onClick={() => {
              patchFloor(index, { services: true });
              flash(`Task services on for ${floor.name}`);
            }}
            style={{
              padding: "9px 13px",
              borderRadius: "9px",
              border: "1px solid rgba(255,197,49,.4)",
              background: "rgba(255,197,49,.1)",
              color: "#FFD666",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Turn on for this floor
          </button>
        </div>
      ) : null}
    </>
  );
}
