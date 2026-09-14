import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { MONO, separator } from "./tokens.ts";

/** One line of the office's own report: what it looked at, and how that answered. */
export type Check = { name: ParseKeys; state: ParseKeys; ok: boolean };

const TICK = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1.8,5.2 4,7.4 8.2,2.6" />
  </svg>
);

const CROSS = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
  >
    <line x1="2.4" y1="2.4" x2="7.6" y2="7.6" />
    <line x1="7.6" y1="2.4" x2="2.4" y2="7.6" />
  </svg>
);

const MARK: React.CSSProperties = {
  width: "18px",
  height: "18px",
  flex: "0 0 18px",
  borderRadius: "6px",
  display: "grid",
  placeItems: "center",
};

const NAME: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  fontSize: "12.5px",
  color: "#E9E7E2",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function CheckRow({ check, first }: { check: Check; first: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const fg = check.ok ? "#8FE8C4" : "#FFB3B3";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "11px",
        padding: "13px 14px",
        borderTop: `1px solid ${separator(first)}`,
      }}
    >
      <span
        style={{
          ...MARK,
          background: check.ok ? "rgba(91,217,160,.16)" : "rgba(255,122,122,.16)",
          color: fg,
        }}
      >
        {check.ok ? TICK : CROSS}
      </span>
      <span style={NAME}>{t(check.name)}</span>
      <span style={{ ...MONO, fontSize: "10.5px", color: fg, flex: "0 0 auto" }}>
        {t(check.state)}
      </span>
    </div>
  );
}
