import type { Step } from "./data-setup.ts";
import { DISPLAY, MONO, stepColours } from "./tokens.ts";

const NUMBER: React.CSSProperties = {
  flex: "0 0 28px",
  width: "28px",
  height: "28px",
  borderRadius: "9px",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "12px",
};

const STATUS: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "3px 9px",
  borderRadius: "99px",
};

const DESC: React.CSSProperties = {
  fontSize: "12.5px",
  color: "#ABA8A1",
  lineHeight: "1.65",
  marginTop: "8px",
  textWrap: "pretty",
};

const ACTION: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: "10px",
  border: "0",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: "600",
  transition: "all .22s",
};

/** One of the four things a new office needs, and the button that does it. */
export function SetupStep({
  step,
  primary,
  onRun,
}: {
  step: Step;
  primary: boolean;
  onRun: () => void;
}): React.JSX.Element {
  const tone = stepColours(step.status);
  return (
    <div
      style={{ display: "flex", gap: "15px", padding: "20px 0", borderBottom: "1px solid #1B1B1F" }}
    >
      <div style={{ ...NUMBER, background: tone.nBg, color: tone.nFg }}>
        <span>{step.n}</span>
      </div>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ ...DISPLAY, fontWeight: "600", fontSize: "14.5px" }}>{step.title}</span>
          <span style={{ ...STATUS, background: tone.sBg, color: tone.sFg }}>{step.status}</span>
        </div>
        <div style={DESC}>{step.desc}</div>
        <div style={{ marginTop: "13px" }}>
          <button
            type="button"
            onClick={onRun}
            style={{
              ...ACTION,
              background: primary ? "var(--a,#FFC531)" : "#24242A",
              color: primary ? "#150F02" : "#E4E1DB",
            }}
            className="hopt"
          >
            {step.btn}
          </button>
        </div>
      </div>
    </div>
  );
}
