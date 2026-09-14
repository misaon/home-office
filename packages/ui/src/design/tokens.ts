import type { Priority } from "./data.ts";

/** A filter pill, on or off. */
export const pill = (on: boolean): { bd: string; bg: string; fg: string } => ({
  bd: on ? "rgba(255,197,49,.45)" : "#26262C",
  bg: on ? "rgba(255,197,49,.12)" : "#101013",
  fg: on ? "#FFD666" : "#CFCCC6",
});

/** The colours a priority is written in. */
export const priority = (p: Priority): { pBg: string; pFg: string } => ({
  pBg: p === "high" ? "rgba(255,122,122,.15)" : p === "low" ? "#24242A" : "rgba(255,197,49,.14)",
  pFg: p === "high" ? "#FFB3B3" : p === "low" ? "#BEBBB4" : "#FFD666",
});

/** A row that only draws a rule when something sits above it. */
export const separator = (first: boolean): string => (first ? "transparent" : "#1E1E23");

export const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace" };
export const DISPLAY: React.CSSProperties = { fontFamily: "'Space Grotesk',sans-serif" };
