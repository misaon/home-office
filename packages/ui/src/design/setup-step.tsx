import { useTranslation } from "react-i18next";
import type { StepState } from "../setup/status.ts";
import { DISPLAY, MONO } from "./tokens.ts";

export type StepStatus = { state: StepState; text: string };

const TONE: Record<
  StepState,
  { bg: string; fg: string; label: "setup.done" | "setup.todo" | "setup.problem" | null }
> = {
  ok: { bg: "rgba(91,217,160,.16)", fg: "#8FE8C4", label: "setup.done" },
  todo: { bg: "#24242A", fg: "#BEBBB4", label: "setup.todo" },
  error: { bg: "rgba(255,122,122,.15)", fg: "#FFB3B3", label: "setup.problem" },
  unknown: { bg: "#24242A", fg: "#BEBBB4", label: null },
};

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

const TAG: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "3px 9px",
  borderRadius: "99px",
};

/** One row of the checklist: number, title, how it stands, and the step's own controls. */
export function SetupStep({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tone = TONE[status.state];
  const done = status.state === "ok";
  return (
    <div
      style={{
        display: "flex",
        gap: "15px",
        padding: "20px 0",
        borderBottom: "1px solid #1B1B1F",
        animation: "fadeUp .4s cubic-bezier(.2,.8,.3,1) both",
        animationDelay: `${String(index * 60)}ms`,
      }}
    >
      <div style={{ ...NUMBER, background: tone.bg, color: tone.fg }}>
        <span>{done ? "✓" : index}</span>
      </div>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ ...DISPLAY, fontWeight: "600", fontSize: "14.5px" }}>{title}</span>
          <span style={{ ...TAG, background: tone.bg, color: tone.fg }}>
            {tone.label === null ? "…" : t(tone.label)}
          </span>
        </div>
        <div
          style={{
            fontSize: "12.5px",
            color: "#ABA8A1",
            lineHeight: "1.65",
            marginTop: "8px",
            textWrap: "pretty",
          }}
        >
          {status.text}
        </div>
        {children === undefined ? null : <div style={{ marginTop: "13px" }}>{children}</div>}
      </div>
    </div>
  );
}
