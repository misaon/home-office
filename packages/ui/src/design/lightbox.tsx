import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** An attachment at full size, over everything, closed by clicking anywhere. */
export function Lightbox(): React.JSX.Element {
  const set = useDesign((s) => s.set);
  const close = (): void => {
    set({ lightbox: false });
  };
  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: "fixed",
        inset: "0",
        zIndex: 85,
        background: "rgba(6,6,7,.86)",
        backdropFilter: "blur(14px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        padding: "24px",
        animation: "fadeIn .26s ease both",
      }}
    >
      <div
        style={{
          width: "min(1240px,97vw)",
          flex: "1 1 auto",
          minHeight: "0",
          display: "flex",
          flexDirection: "column",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid rgba(255,197,49,.3)",
          boxShadow: "0 50px 120px rgba(0,0,0,.75)",
          animation: "popIn .42s cubic-bezier(.2,.9,.3,1.05) both",
        }}
      >
        <div
          style={{
            flex: "1",
            minHeight: "0",
            backgroundImage:
              "repeating-linear-gradient(135deg,rgba(255,197,49,.16) 0 16px,rgba(255,197,49,.05) 16px 32px)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <span style={{ ...MONO, fontSize: "13px", color: "#E4C778" }}>
            floor-plan.png · 2 400 × 1 350
          </span>
        </div>
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "13px 16px",
            background: "#111114",
            borderTop: "1px solid #26262C",
          }}
        >
          <span
            style={{
              flex: "1",
              minWidth: "0",
              ...MONO,
              fontSize: "11.5px",
              color: "#CFCCC6",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            floor-plan.png · sent 21:38 · 1.2 MB
          </span>
          <button
            type="button"
            style={{
              padding: "8px 13px",
              borderRadius: "9px",
              border: "1px solid #2C2C32",
              background: "transparent",
              fontSize: "12px",
              color: "#CFCCC6",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all .2s",
            }}
            className="hop8"
          >
            Download
          </button>
          <button
            type="button"
            onClick={close}
            style={{
              padding: "8px 13px",
              borderRadius: "9px",
              border: "0",
              background: "var(--a,#FFC531)",
              color: "#150F02",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Close
          </button>
        </div>
      </div>
      <span style={{ fontSize: "11.5px", color: "#A6A39C", flex: "0 0 auto" }}>
        Click anywhere to close
      </span>
    </div>
  );
}
