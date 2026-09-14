import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DISPLAY } from "./tokens.ts";

export type Ask = {
  title: string;
  body: string;
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  act: () => void;
};

const CENTRE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
};

const SHEET: React.CSSProperties = {
  width: "min(440px,100%)",
  borderRadius: "18px",
  background: "#0D0D10",
  border: "1px solid #2A2A32",
  boxShadow: "0 50px 120px rgba(0,0,0,.75)",
  animation: "popIn .4s cubic-bezier(.2,.9,.3,1.05) both",
};

const FOOT: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "9px",
  padding: "14px 24px",
  borderTop: "1px solid #1B1B1F",
  background: "#0B0B0E",
};

/** How bad this is, as one mark: a warning triangle, or a circle that only wants to be sure. */
function AskMark({ danger }: { danger: boolean }): React.JSX.Element {
  return (
    <div
      style={{
        width: "38px",
        height: "38px",
        flex: "0 0 38px",
        borderRadius: "12px",
        display: "grid",
        placeItems: "center",
        background: danger ? "rgba(255,122,122,.12)" : "rgba(255,197,49,.14)",
        color: danger ? "#FFB3B3" : "#FFD666",
      }}
    >
      {danger ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M10 3.2 2.6 16h14.8z" />
          <line x1="10" y1="8" x2="10" y2="11.6" />
          <circle cx="10" cy="13.8" r=".9" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="7.2" />
          <line x1="10" y1="6.4" x2="10" y2="10.4" />
          <circle cx="10" cy="13.4" r=".9" fill="currentColor" stroke="none" />
        </svg>
      )}
    </div>
  );
}

/** Keep it, or go through with it. */
function AskFoot({
  ask,
  danger,
  onClose,
}: {
  ask: Ask | null;
  danger: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={FOOT}>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: "10px 16px",
          borderRadius: "11px",
          border: "1px solid #2C2C32",
          background: "transparent",
          fontSize: "12.5px",
          color: "#CFCCC6",
          cursor: "pointer",
          transition: "all .2s",
        }}
        className="ho-2955a9"
      >
        {ask?.cancelLabel ?? t("confirm.keep")}
      </button>
      <button
        type="button"
        onClick={() => {
          ask?.act();
          onClose();
        }}
        style={{
          padding: "10px 18px",
          borderRadius: "11px",
          border: "0",
          cursor: "pointer",
          fontSize: "12.5px",
          fontWeight: "600",
          transition: "all .22s",
          background: danger ? "rgba(255,122,122,.18)" : "var(--a,#FFC531)",
          color: danger ? "#FFC9C9" : "#150F02",
        }}
        className="ho-2ea730"
      >
        {ask?.okLabel ?? t("common.remove")}
      </button>
    </div>
  );
}

/**
 * Asking before something cannot be undone. A real `<dialog>`, so the platform brings the focus trap,
 * Escape and the backdrop; what the office adds is the icon that says how bad this is.
 */
export function Confirm({
  ask,
  onClose,
}: {
  ask: Ask | null;
  onClose: () => void;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const danger = ask?.danger !== false;

  useEffect(() => {
    const element = dialog.current;
    if (ask !== null) {
      element?.showModal();
      // showModal() hands focus to the first focusable thing, which is the scrolling sheet: a scroll
      // container Chrome rings in blue. The dialog itself takes it instead, and wears no ring.
      element?.focus();
    } else {
      element?.close();
    }
  }, [ask]);

  return (
    <dialog
      ref={dialog}
      className="ho-dialog ho-scrim-strong"
      aria-label={ask?.title ?? ""}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div style={CENTRE}>
        <div style={SHEET}>
          <div style={{ display: "flex", gap: "14px", padding: "22px 24px 18px" }}>
            <AskMark danger={danger} />
            <div style={{ flex: "1", minWidth: "0" }}>
              <div
                style={{
                  ...DISPLAY,
                  fontWeight: "700",
                  fontSize: "17px",
                  letterSpacing: "-.01em",
                  lineHeight: "1.25",
                  textWrap: "pretty",
                }}
              >
                {ask?.title ?? ""}
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#ABA8A1",
                  marginTop: "8px",
                  lineHeight: "1.6",
                  textWrap: "pretty",
                }}
              >
                {ask?.body ?? ""}
              </div>
            </div>
          </div>
          <AskFoot ask={ask} danger={danger} onClose={onClose} />
        </div>
      </div>
    </dialog>
  );
}
