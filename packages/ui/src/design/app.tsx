import { useEffect } from "react";
import { Editor } from "./editor.tsx";
import { Header } from "./header.tsx";
import { Lightbox } from "./lightbox.tsx";
import { Panel } from "./panel.tsx";
import { Setup } from "./setup.tsx";
import { Stage } from "./stage.tsx";
import { Toast } from "./toast.tsx";
import { useDesign } from "./store.ts";

/**
 * The knobs the design was drawn with. Their defaults are the drawing: change one and you are looking
 * at a variant, not at the original.
 */
export type DesignProps = {
  internalTools?: boolean;
  accent?: string;
  panelWidth?: number;
  ambientGlow?: boolean;
  stageTheme?: "Light floor" | "Dark floor";
};

const GLOW_A: React.CSSProperties = {
  position: "absolute",
  top: "-260px",
  left: "4%",
  width: "640px",
  height: "640px",
  borderRadius: "50%",
  background: "radial-gradient(circle,rgba(255,197,49,.11),rgba(255,197,49,0) 66%)",
  animation: "drift 26s ease-in-out infinite",
};

const GLOW_B: React.CSSProperties = {
  position: "absolute",
  bottom: "-300px",
  right: "22%",
  width: "560px",
  height: "560px",
  borderRadius: "50%",
  background: "radial-gradient(circle,rgba(255,197,49,.07),rgba(255,197,49,0) 68%)",
  animation: "drift2 34s ease-in-out infinite",
};

/** The office, as drawn: a lit floor on the left and the five panels on the right. */
export function DesignApp({
  internalTools = false,
  accent = "#FFC531",
  panelWidth = 420,
  ambientGlow = true,
  stageTheme = "Light floor",
}: DesignProps): React.JSX.Element {
  const floorOpen = useDesign((s) => s.floorOpen);
  const attachOpen = useDesign((s) => s.attachOpen);
  const usageOpen = useDesign((s) => s.usageOpen);
  const openSelect = useDesign((s) => s.openSelect);
  const lightbox = useDesign((s) => s.lightbox);
  const setup = useDesign((s) => s.setup);
  const editor = useDesign((s) => s.editor);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const runCounts = useDesign((s) => s.runCounts);
  const light = stageTheme === "Light floor";

  useEffect(() => {
    runCounts();
  }, [runCounts]);

  return (
    <div
      style={
        {
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "#0A0A0B",
          color: "#F4F3F0",
          position: "relative",
          overflow: "hidden",
          "--a": accent,
          "--pw": `${String(panelWidth)}px`,
          "--floor": light ? "#EDEBE4" : "#0F0F12",
          "--gridl": light ? "rgba(0,0,0,.07)" : "rgba(255,197,49,.1)",
        } as React.CSSProperties
      }
    >
      {ambientGlow ? (
        <div
          style={{
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: 0,
          }}
        >
          <div style={GLOW_A} />
          <div style={GLOW_B} />
        </div>
      ) : null}
      <Header internal={internalTools} />
      <main
        style={{ flex: "1", display: "flex", minHeight: "0", position: "relative", zIndex: 10 }}
      >
        <Stage internal={internalTools} />
        <Panel />
      </main>
      {floorOpen ? (
        <div
          role="presentation"
          onClick={() => {
            update((s) => ({ floorOpen: !s.floorOpen, floorQuery: "" }));
          }}
          style={{ position: "fixed", inset: "0", zIndex: 35 }}
        />
      ) : null}
      {attachOpen || usageOpen || openSelect !== null ? (
        <div
          role="presentation"
          onClick={() => {
            set({ attachOpen: false, usageOpen: false, openSelect: null });
          }}
          style={{ position: "fixed", inset: "0", zIndex: 28 }}
        />
      ) : null}
      {internalTools && editor ? <Editor /> : null}
      {lightbox ? <Lightbox /> : null}
      {setup ? <Setup /> : null}
      <Toast />
    </div>
  );
}
