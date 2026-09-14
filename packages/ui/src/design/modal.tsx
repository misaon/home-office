import { useEffect, useRef } from "react";
import { DISPLAY } from "./tokens.ts";

const CENTRE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
};

const SHEET: React.CSSProperties = {
  width: "min(620px,100%)",
  maxHeight: "100%",
  overflowY: "auto",
  borderRadius: "22px",
  background: "#0D0D10",
  border: "1px solid #2A2A32",
  boxShadow: "0 50px 120px rgba(0,0,0,.7)",
  animation: "popIn .46s cubic-bezier(.2,.9,.3,1.05) both",
};

/** A dialog in the office's own language: the same sheet the setup checklist arrives on. */
export function Modal({
  open,
  title,
  description,
  footer,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element | null {
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
        onClose();
      }}
    >
      <div style={CENTRE}>
        <div style={SHEET}>
          <div style={{ padding: "24px 26px 20px", borderBottom: "1px solid #1B1B1F" }}>
            <div
              style={{ ...DISPLAY, fontWeight: "700", fontSize: "21px", letterSpacing: "-.01em" }}
            >
              {title}
            </div>
            {description === undefined ? null : (
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#ABA8A1",
                  marginTop: "6px",
                  lineHeight: "1.6",
                }}
              >
                {description}
              </div>
            )}
          </div>
          <div
            style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: "18px" }}
          >
            {children}
          </div>
          <div
            style={{
              padding: "16px 26px 22px",
              borderTop: "1px solid #1B1B1F",
              display: "flex",
              alignItems: "center",
              gap: "9px",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** A titled block inside a dialog. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "10px",
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "#ABA8A1",
          marginBottom: "10px",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>{children}</div>
    </div>
  );
}
