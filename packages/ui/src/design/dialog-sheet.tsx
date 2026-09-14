import { useEffect, useRef } from "react";

/**
 * The shape both of the office's big dialogs arrive in: a sheet that pops in over a blurred office,
 * a lit header, a body, and a footer that says what will happen. A real `<dialog>`, so the platform
 * brings the focus trap, Escape and the backdrop.
 */

const CENTRE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
};

const GLOW: React.CSSProperties = {
  position: "absolute",
  top: "-90px",
  left: "-40px",
  width: "280px",
  height: "280px",
  borderRadius: "50%",
  background: "radial-gradient(circle,rgba(255,197,49,.12),transparent 68%)",
  pointerEvents: "none",
};

const FOOT: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "16px 26px",
  borderTop: "1px solid #1B1B1F",
  background: "#0B0B0E",
};

/** The hint the footer carries on the left, which grows to push the buttons right. */
export const HINT: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  fontSize: "11.5px",
  color: "#A6A39C",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const CANCEL: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "11px",
  border: "1px solid #2C2C32",
  background: "transparent",
  fontSize: "12.5px",
  color: "#CFCCC6",
  cursor: "pointer",
  flex: "0 0 auto",
  transition: "all .2s",
};

export const COMMIT: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "11px",
  border: "0",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: "600",
  flex: "0 0 auto",
  transition: "all .22s",
};

/** The label above a field, and the caption above a group of them. */
export const CAP: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "9.5px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

export const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: "12px",
  border: "1px solid #2C2C32",
  background: "#101013",
  fontSize: "12.5px",
};

export function DialogSheet({
  open,
  width,
  label,
  head,
  footer,
  onClose,
  children,
}: {
  open: boolean;
  width: string;
  label: string;
  head: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      element?.showModal();
      // showModal() hands focus to the first focusable thing, which is the scrolling sheet: a scroll
      // container Chrome rings in blue. The dialog itself takes it instead, and wears no ring.
      element?.focus();
    } else {
      element?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="ho-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div style={CENTRE}>
        <div
          style={{
            width,
            maxHeight: "100%",
            overflowY: "auto",
            borderRadius: "20px",
            background: "#0D0D10",
            border: "1px solid #2A2A32",
            boxShadow: "0 50px 120px rgba(0,0,0,.72)",
            animation: "popIn .44s cubic-bezier(.2,.9,.3,1.05) both",
          }}
        >
          <div style={{ position: "relative", padding: "24px 26px 20px", overflow: "hidden" }}>
            <div style={GLOW} />
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
              }}
            >
              {head}
            </div>
          </div>
          <div style={{ padding: "0 26px 22px" }}>{children}</div>
          <div style={FOOT}>{footer}</div>
        </div>
      </div>
    </dialog>
  );
}
