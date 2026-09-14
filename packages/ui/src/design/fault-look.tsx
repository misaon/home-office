import type { Variant } from "./fault-body.tsx";
import { DISPLAY, MONO } from "./tokens.ts";

/** The fault screen's fixed surfaces: the three variant marks, and the shapes they sit in. */
export const ICONS: Record<Variant, React.JSX.Element> = {
  crash: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M10 2.6 2.2 16.4h15.6z" />
      <line x1="10" y1="7.6" x2="10" y2="11.6" />
      <circle cx="10" cy="13.9" r=".95" fill="currentColor" stroke="none" />
    </svg>
  ),
  config: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 3h7l4 4v10H4z" />
      <polyline points="11,3 11,7 15,7" />
      <line x1="9.5" y1="10" x2="9.5" y2="12.6" />
      <circle cx="9.5" cy="14.6" r=".85" fill="currentColor" stroke="none" />
    </svg>
  ),
  offline: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="2.6" y="4" width="14.8" height="5" rx="1.6" />
      <rect x="2.6" y="11" width="14.8" height="5" rx="1.6" />
      <line x1="5.4" y1="6.5" x2="5.4" y2="6.5" />
      <line x1="5.4" y1="13.5" x2="5.4" y2="13.5" />
      <line x1="14" y1="2.6" x2="6" y2="17.4" />
    </svg>
  ),
};

export const GROUND: React.CSSProperties = {
  position: "fixed",
  inset: "0",
  zIndex: 95,
  background: "#0A0A0B",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
  overflowY: "auto",
  animation: "fadeIn .3s ease both",
};

export const TILE: React.CSSProperties = {
  width: "48px",
  height: "48px",
  flex: "0 0 48px",
  borderRadius: "15px",
  display: "grid",
  placeItems: "center",
};

export const KIND: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

export const TITLE: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "27px",
  letterSpacing: "-.02em",
  lineHeight: "1.15",
  marginTop: "10px",
  textWrap: "pretty",
};

export const BODY: React.CSSProperties = {
  fontSize: "13px",
  color: "#ABA8A1",
  marginTop: "12px",
  lineHeight: "1.65",
  textWrap: "pretty",
};

export const CARD: React.CSSProperties = {
  marginTop: "24px",
  borderRadius: "15px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
};

export const TOGGLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "14px",
  padding: "0",
  border: "0",
  background: "transparent",
  color: "#CFCCC6",
  fontSize: "12px",
  cursor: "pointer",
  transition: "color .2s",
};

export const LOG: React.CSSProperties = {
  margin: "11px 0 0",
  padding: "14px",
  borderRadius: "13px",
  background: "#0C0C0E",
  border: "1px solid #232328",
  ...MONO,
  fontSize: "11px",
  lineHeight: "1.75",
  color: "#BEBBB4",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  animation: "riseIn .28s ease both",
};

export const PRIMARY: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "13px 20px",
  borderRadius: "13px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all .22s cubic-bezier(.2,.8,.3,1)",
};

export const QUIET: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: "13px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "13px",
  color: "#CFCCC6",
  cursor: "pointer",
  transition: "all .2s",
};
