import { createRoot } from "react-dom/client";
import { DesignApp, type DesignProps } from "./app.tsx";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root");
}

/**
 * The mockup's own knobs, readable from the query string, so a variant can be looked at — and held
 * against the original — without editing the source.
 */
function knobs(): DesignProps {
  const q = new URLSearchParams(window.location.search);
  const props: DesignProps = {};
  const accent = q.get("accent");
  const width = q.get("panelWidth");
  const theme = q.get("stageTheme");
  if (q.get("internalTools") !== null) {
    props.internalTools = q.get("internalTools") !== "0";
  }
  if (accent !== null) {
    props.accent = accent;
  }
  if (width !== null && Number.isFinite(Number(width))) {
    props.panelWidth = Number(width);
  }
  if (q.get("ambientGlow") !== null) {
    props.ambientGlow = q.get("ambientGlow") !== "0";
  }
  if (theme === "Light floor" || theme === "Dark floor") {
    props.stageTheme = theme;
  }
  return props;
}

createRoot(root).render(<DesignApp {...knobs()} />);
