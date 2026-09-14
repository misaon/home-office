import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Check, CheckRow } from "./fault-check.tsx";
import {
  BODY,
  CARD,
  GROUND,
  ICONS,
  KIND,
  LOG,
  PRIMARY,
  QUIET,
  TILE,
  TITLE,
  TOGGLE,
} from "./fault-look.tsx";
import { MONO } from "./tokens.ts";

export type Variant = "crash" | "config" | "offline";

/** Everything the fault screen says about one way the office cannot work. */
export type Fault = {
  variant: Variant;
  kind: ParseKeys;
  title: ParseKeys;
  body: ParseKeys;
  primary: ParseKeys;
  glow: string;
  iconBg: string;
  iconFg: string;
  iconBd: string;
  checks: Check[];
  log: string;
};

/** The mark, the kind, the headline and the paragraph: what the office says went wrong. */
function FaultHead({ fault }: { fault: Fault }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
      <div
        style={{
          ...TILE,
          background: fault.iconBg,
          color: fault.iconFg,
          border: `1px solid ${fault.iconBd}`,
        }}
      >
        {ICONS[fault.variant]}
      </div>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div style={{ ...KIND, color: fault.iconFg }}>{t(fault.kind)}</div>
        <div style={TITLE}>{t(fault.title)}</div>
        <div style={BODY}>{t(fault.body)}</div>
      </div>
    </div>
  );
}

/** Reload, open setup, copy the report: the three things left to do. */
function FaultActions({
  primary,
  onSetup,
  onCopy,
}: {
  primary: ParseKeys;
  onSetup: () => void;
  onCopy: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        marginTop: "24px",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        style={PRIMARY}
        className="ho-2d2744"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
          <polyline points="13.6,2 13.6,5 10.6,5" />
        </svg>{" "}
        <span>{t(primary)}</span>
      </button>
      <button type="button" onClick={onSetup} style={QUIET} className="ho-2955a9">
        {t("fault.openSetup")}
      </button>
      <div style={{ flex: "1" }} />
      <button
        type="button"
        onClick={onCopy}
        style={{ ...QUIET, padding: "13px 16px", whiteSpace: "nowrap" }}
        className="ho-96ee65"
      >
        {t("fault.copy")}
      </button>
    </div>
  );
}

/** The office cannot work: what happened, what it checked, and the two ways forward. */
export function FaultBody({
  fault,
  reference,
  onSetup,
  onCopy,
}: {
  fault: Fault;
  reference: string;
  onSetup: () => void;
  onCopy: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div style={GROUND}>
      <div
        style={{
          position: "absolute",
          top: "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "760px",
          height: "560px",
          borderRadius: "50%",
          background: `radial-gradient(circle,${fault.glow},transparent 68%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(620px,100%)",
          animation: "popIn .5s cubic-bezier(.2,.9,.3,1.05) both",
        }}
      >
        <FaultHead fault={fault} />
        <div style={CARD}>
          {fault.checks.map((check, i) => (
            <CheckRow key={check.name} check={check} first={i === 0} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setLogOpen(!logOpen);
          }}
          style={TOGGLE}
          className="ho-9a7f58"
        >
          <svg
            style={{
              transition: "transform .3s",
              transform: `rotate(${logOpen ? "90deg" : "0deg"})`,
            }}
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <polyline points="4.5,3 8,6 4.5,9" />
          </svg>{" "}
          <span>{t(logOpen ? "fault.hideLog" : "fault.showLog")}</span>
        </button>
        {logOpen ? <pre style={LOG}>{fault.log}</pre> : null}
        <FaultActions primary={fault.primary} onSetup={onSetup} onCopy={onCopy} />
        <div style={{ marginTop: "16px", ...MONO, fontSize: "10.5px", color: "#8A8780" }}>
          {reference}
        </div>
      </div>
    </div>
  );
}
