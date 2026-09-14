import type { Step } from "./data-setup.ts";
import type { Priority } from "./data.ts";

/** A filter pill, on or off. */
export const pill = (on: boolean): { bd: string; bg: string; fg: string } => ({
  bd: on ? "rgba(255,197,49,.45)" : "#26262C",
  bg: on ? "rgba(255,197,49,.12)" : "#101013",
  fg: on ? "#FFD666" : "#CFCCC6",
});

/** A segmented-control slot, on or off. */
export const seg = (on: boolean): { bg: string; fg: string } => ({
  bg: on ? "rgba(255,197,49,.16)" : "transparent",
  fg: on ? "#FFD666" : "#ABA8A1",
});

/** The colours a priority is written in. */
export const priority = (p: Priority): { pBg: string; pFg: string } => ({
  pBg: p === "high" ? "rgba(255,122,122,.15)" : p === "low" ? "#24242A" : "rgba(255,197,49,.14)",
  pFg: p === "high" ? "#FFB3B3" : p === "low" ? "#BEBBB4" : "#FFD666",
});

/** Green when a setup step is settled, amber while it works, grey until it is asked. */
export const stepColours = (
  status: Step["status"],
): { nBg: string; nFg: string; sBg: string; sFg: string } =>
  status === "ready" || status === "stored"
    ? { nBg: "rgba(91,217,160,.16)", nFg: "#8FE8C4", sBg: "rgba(91,217,160,.14)", sFg: "#8FE8C4" }
    : status === "working"
      ? { nBg: "rgba(255,197,49,.18)", nFg: "#FFD666", sBg: "rgba(255,197,49,.14)", sFg: "#FFD666" }
      : { nBg: "#24242A", nFg: "#BEBBB4", sBg: "#24242A", sFg: "#BEBBB4" };

/** A row that only draws a rule when something sits above it. */
export const separator = (first: boolean): string => (first ? "transparent" : "#1E1E23");

export const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace" };
export const DISPLAY: React.CSSProperties = { fontFamily: "'Space Grotesk',sans-serif" };

/** The small upper-case caption the panels label their fields with. */
export const CAPTION: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};
