import { useState } from "react";
import { NewFloor } from "./new-floor.tsx";
import { EditorOverlay } from "../editor/overlay.tsx";
import { useDevReload } from "../dev-reload.ts";
import { Setup, useSetupAutoOpen } from "./setup.tsx";
import { useUi } from "../store.ts";
import { Confirm } from "./confirm.tsx";
import { EmptyOffice } from "./empty-office.tsx";
import { FaultScreen } from "./fault.tsx";
import { Header } from "./header.tsx";
import { DiffDialog } from "./diff-dialog.tsx";
import { Lightbox } from "./lightbox.tsx";
import { Panel } from "./panel.tsx";
import { Stage } from "./stage.tsx";
import { useDesign } from "./store.ts";
import { AgentDialog } from "./agent-dialog.tsx";
import { useFloor } from "./live.ts";

function FloorOverlays(): React.JSX.Element | null {
  const floor = useFloor();
  if (floor === null) {
    return null;
  }
  return <AgentDialog floor={floor} />;
}

function Toast(): React.JSX.Element | null {
  const toast = useDesign((s) => s.toast);
  if (toast === null) {
    return null;
  }
  return (
    <div className="fixed bottom-28 left-1/2 z-90 flex items-center gap-10 py-11 px-16 rounded-12 bg-toast border border-accent-a35 shadow-toast animate-toast">
      <span className="w-7 h-7 rounded-half bg-accent shadow-glow-gold flex-[0_0_auto]" />
      <span className="text-12h text-ink-warm">{toast}</span>
    </div>
  );
}

const DEV = process.env.NODE_ENV === "development";

const SHELL = "h-screen flex flex-col bg-ground text-ink relative overflow-hidden";

const GLOW_A =
  "absolute -top-260 left-[4%] w-640 h-640 rounded-half bg-[radial-gradient(circle,var(--color-accent-a11),var(--color-accent-a00)_66%)] animate-drift";

const GLOW_B =
  "absolute -bottom-300 right-[22%] w-560 h-560 rounded-half bg-[radial-gradient(circle,var(--color-accent-a07),var(--color-accent-a00)_68%)] animate-drift-slow";

export function App(): React.JSX.Element {
  const [editorFromUrl] = useState(
    () => DEV && new URLSearchParams(window.location.search).has("editor"),
  );
  const hasFloors = useUi((s) => s.snapshot.projects.size > 0);
  const empty = useUi((s) => s.replayed && s.snapshot.projects.size === 0);
  const lightbox = useDesign((s) => s.lightbox);
  const diff = useDesign((s) => s.diff);
  const editor = useDesign((s) => s.editor);
  const ask = useDesign((s) => s.ask);
  const set = useDesign((s) => s.set);
  const panelWidth = useDesign((s) => s.panelWidth);
  useSetupAutoOpen();
  useDevReload();

  return (
    <div className={SHELL} style={{ "--panel": `${String(panelWidth)}px` }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className={GLOW_A} />
        <div className={GLOW_B} />
      </div>
      <Header internal={DEV} hasFloors={hasFloors} />
      {empty ? <EmptyOffice /> : null}
      {/* The drawing gave `main` a z-index, which founds a stacking context; tree order alone already
          puts it above the glows behind it, and every popup is portalled out of it now. */}
      {hasFloors ? (
        <main className="flex-1 flex min-h-0 relative">
          <Stage internal={DEV} />
          <Panel />
        </main>
      ) : null}
      {DEV && (editor || editorFromUrl) ? (
        <EditorOverlay
          onClose={() => {
            set({ editor: false });
          }}
        />
      ) : null}
      {lightbox === null ? null : <Lightbox attachment={lightbox} />}
      {diff === null ? null : <DiffDialog change={diff} />}
      <FloorOverlays />
      <NewFloor />
      <Setup />
      <Confirm
        ask={ask}
        onClose={() => {
          set({ ask: null });
        }}
      />
      <FaultScreen />
      <Toast />
    </div>
  );
}
