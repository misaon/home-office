import { useDesign } from "./store.ts";

/** What just happened, said once and then gone. */
export function Toast(): React.JSX.Element | null {
  const toast = useDesign((s) => s.toast);
  if (toast === null) {
    return null;
  }
  return (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        left: "50%",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "11px 16px",
        borderRadius: "12px",
        background: "#141418",
        border: "1px solid rgba(255,197,49,.35)",
        boxShadow: "0 20px 44px rgba(0,0,0,.6)",
        animation: "toastIn .38s cubic-bezier(.2,.9,.3,1.05) both",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: "var(--a,#FFC531)",
          boxShadow: "0 0 10px rgba(255,197,49,.8)",
          flex: "0 0 auto",
        }}
      />
      <span style={{ fontSize: "12.5px", color: "#F2EFE8" }}>{toast}</span>
    </div>
  );
}
