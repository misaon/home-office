import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./controls.tsx";
import { DISPLAY } from "./tokens.ts";

const CENTRE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
};

const SHEET: React.CSSProperties = {
  width: "min(420px,100%)",
  borderRadius: "18px",
  background: "#0D0D10",
  border: "1px solid #2A2A32",
  boxShadow: "0 40px 100px rgba(0,0,0,.7)",
  padding: "22px 24px",
  animation: "popIn .36s cubic-bezier(.2,.9,.3,1.05) both",
};

/**
 * Asking before something cannot be undone. A real `<dialog>`, so the platform brings the focus trap and
 * Escape; the office only says what is about to happen and which way out is which.
 */
export function Confirm({
  open,
  title,
  body,
  action,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      element?.showModal();
    } else {
      element?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="ho-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div style={CENTRE}>
        <div style={SHEET}>
          <div style={{ ...DISPLAY, fontWeight: "700", fontSize: "17px", letterSpacing: "-.01em" }}>
            {title}
          </div>
          <div
            style={{ fontSize: "12.5px", color: "#ABA8A1", marginTop: "8px", lineHeight: "1.65" }}
          >
            {body}
          </div>
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "9px", marginTop: "20px" }}
          >
            <Button onClick={onCancel}>{t("common.cancel")}</Button>
            <Button tone="danger" onClick={onConfirm}>
              {action}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
