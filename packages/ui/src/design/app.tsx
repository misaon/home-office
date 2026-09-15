import { useState } from "react";
import { NewFloor } from "./new-floor.tsx";
import { EditorOverlay } from "../editor/overlay.tsx";
import { useDevReload } from "../dev-reload.ts";
import { Setup, useSetupAutoOpen } from "./setup.tsx";
import { useUi } from "../store.ts";
import { Confirm } from "./confirm.tsx";
import { EmptyOffice } from "./empty-office.tsx";
import { FaultScreen } from "./fault.tsx";
import { FloorOverlays } from "./overlays.tsx";
import { Header } from "./header.tsx";
import { Lightbox } from "./lightbox.tsx";
import { Panel } from "./panel.tsx";
import { Stage } from "./stage.tsx";
import { Toast } from "./toast.tsx";
import { useDesign } from "./store.ts";

/** The office editor is internal: a production bundle carries neither the branch nor the import. */
const DEV = process.env.NODE_ENV === "development";

const SHELL = "h-screen flex flex-col bg-ground text-ink relative overflow-hidden";

const GLOW_A =
  "absolute -top-260 left-[4%] w-640 h-640 rounded-half bg-[radial-gradient(circle,var(--color-accent-a11),var(--color-accent-a00)_66%)] animate-drift";

const GLOW_B =
  "absolute -bottom-300 right-[22%] w-560 h-560 rounded-half bg-[radial-gradient(circle,var(--color-accent-a07),var(--color-accent-a00)_68%)] animate-drift-slow";

/** The office: a lit floor on the left and the five panels on the right. */
export function App(): React.JSX.Element {
  const [editorFromUrl] = useState(
    () => DEV && new URLSearchParams(window.location.search).has("editor"),
  );
  const hasFloors = useUi((s) => s.snapshot.projects.size > 0);
  // Until the log has been replayed the office does not yet know whether it has floors; showing the
  // empty office in that gap would flash the wrong screen at every reload.
  const empty = useUi((s) => s.replayed && s.snapshot.projects.size === 0);
  const popover = useDesign((s) => s.popover);
  const floorOpen = useDesign((s) => s.floorOpen);
  const lightbox = useDesign((s) => s.lightbox);
  const editor = useDesign((s) => s.editor);
  const ask = useDesign((s) => s.ask);
  const set = useDesign((s) => s.set);
  useSetupAutoOpen();
  useDevReload();

  return (
    <div className={SHELL}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className={GLOW_A} />
        <div className={GLOW_B} />
      </div>
      <Header internal={DEV} hasFloors={hasFloors} />
      {empty ? <EmptyOffice /> : null}
      {/* The drawing gave `main` a z-index, which founds a stacking context and caps every popover
          inside the panel below the sheet that dismisses them; tree order alone already puts it above
          the glows behind it. */}
      {hasFloors ? (
        <main className="flex-1 flex min-h-0 relative">
          <Stage internal={DEV} />
          <Panel />
        </main>
      ) : null}
      {floorOpen ? (
        <div
          role="presentation"
          onClick={() => {
            set({ floorOpen: false });
          }}
          className="fixed inset-0 z-35"
        />
      ) : null}
      {popover !== null ? (
        <div
          role="presentation"
          onClick={() => {
            set({ popover: null });
          }}
          className="fixed inset-0 z-28"
        />
      ) : null}
      {DEV && (editor || editorFromUrl) ? (
        <EditorOverlay
          onClose={() => {
            set({ editor: false });
          }}
        />
      ) : null}
      {lightbox === null ? null : <Lightbox attachment={lightbox} />}
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
