import { StageCamera } from "./stage-camera.tsx";
import { useOffice } from "../office/office-canvas.tsx";

const FRAME: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  position: "relative",
  borderRadius: "20px",
  border: "1px solid #24242A",
  overflow: "hidden",
  background: "var(--floor,#EDEBE4)",
  boxShadow: "0 40px 90px rgba(0,0,0,.55)",
};

/** The floor itself, drawn by the office, inside the frame the design puts around it. */
export function Stage({ internal }: { internal: boolean }): React.JSX.Element {
  const { ref, handle } = useOffice();

  return (
    <section
      style={{
        flex: "1",
        minWidth: "0",
        position: "relative",
        display: "flex",
        padding: "22px",
        backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <div style={FRAME}>
        <div ref={ref} style={{ position: "absolute", inset: "0" }} />
        <div
          style={{
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            height: "2px",
            background: "linear-gradient(90deg,transparent,rgba(255,197,49,.55),transparent)",
            animation: "scan 9s linear infinite",
            pointerEvents: "none",
          }}
        />
      </div>
      <StageCamera internal={internal} office={handle} />
    </section>
  );
}
