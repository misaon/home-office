import { SetupStep } from "./setup-step.tsx";
import { DISPLAY } from "./tokens.ts";
import { useDesign } from "./store.ts";

let stepTimer: ReturnType<typeof setTimeout> | undefined;

const SCRIM: React.CSSProperties = {
  position: "fixed",
  inset: "0",
  zIndex: 80,
  background: "rgba(6,6,7,.74)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
  animation: "fadeIn .28s ease both",
};

const SHEET: React.CSSProperties = {
  width: "min(680px,100%)",
  maxHeight: "100%",
  overflowY: "auto",
  borderRadius: "22px",
  background: "#0D0D10",
  border: "1px solid #2A2A32",
  boxShadow: "0 50px 120px rgba(0,0,0,.7)",
  animation: "popIn .46s cubic-bezier(.2,.9,.3,1.05) both",
};

const HEAD: React.CSSProperties = {
  padding: "24px 26px 20px",
  borderBottom: "1px solid #1B1B1F",
  display: "flex",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
};

const GHOST: React.CSSProperties = {
  padding: "8px 13px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "12px",
  color: "#CFCCC6",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all .2s",
};

/** The four things a new office needs, each one able to say how it is doing. */
export function Setup(): React.JSX.Element {
  const steps = useDesign((s) => s.steps);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);

  return (
    <div style={SCRIM}>
      <div style={SHEET}>
        <div style={HEAD}>
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div
              style={{ ...DISPLAY, fontWeight: "700", fontSize: "21px", letterSpacing: "-.01em" }}
            >
              Set up your office
            </div>
            <div
              style={{ fontSize: "12.5px", color: "#ABA8A1", marginTop: "6px", lineHeight: "1.6" }}
            >
              Three things make the office work; the fourth is a hello to a floor&apos;s boss.
            </div>
          </div>
          <div style={{ display: "flex", gap: "7px" }}>
            <button
              type="button"
              onClick={() => {
                update((s) => ({ steps: s.steps.map((x) => ({ ...x, status: "working" })) }));
                flash("Re-checking all four steps");
                clearTimeout(stepTimer);
                stepTimer = setTimeout(() => {
                  update((s) => ({
                    steps: s.steps.map((x, n) => ({ ...x, status: n === 3 ? "to do" : "ready" })),
                  }));
                }, 1800);
              }}
              style={GHOST}
              className="hop3"
            >
              Re-check
            </button>
            <button
              type="button"
              onClick={() => {
                set({ setup: false });
              }}
              style={GHOST}
              className="hop3"
            >
              Skip for now
            </button>
          </div>
        </div>
        <div style={{ padding: "8px 26px 26px" }}>
          {steps.map((step, i) => (
            <SetupStep
              key={step.n}
              step={step}
              primary={i === 3}
              onRun={() => {
                update((s) => ({
                  steps: s.steps.map((x, n) => (n === i ? { ...x, status: "working" } : x)),
                }));
                flash(`${step.title} — running`);
                clearTimeout(stepTimer);
                stepTimer = setTimeout(() => {
                  update((s) => ({
                    steps: s.steps.map((x, n) => (n === i ? { ...x, status: "ready" } : x)),
                  }));
                }, 1600);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
