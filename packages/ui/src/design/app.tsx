import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddProject } from "./add-project.tsx";
import { EditorOverlay } from "../editor/overlay.tsx";
import { useDevReload } from "../dev-reload.ts";
import { Setup, useSetupAutoOpen } from "./setup.tsx";
import { CONNECTION_KEY, useUi } from "../store.ts";
import { Header } from "./header.tsx";
import { Lightbox } from "./lightbox.tsx";
import { Panel } from "./panel.tsx";
import { Stage } from "./stage.tsx";
import { Toast } from "./toast.tsx";
import { useDesign } from "./store.ts";

/** The office editor is internal: a production bundle carries neither the branch nor the import. */
const DEV = process.env.NODE_ENV === "development";

const SHELL: React.CSSProperties = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "#0A0A0B",
  color: "#F4F3F0",
  position: "relative",
  overflow: "hidden",
  "--a": "#FFC531",
  "--pw": "420px",
  "--floor": "#EDEBE4",
  "--gridl": "rgba(0,0,0,.07)",
} as React.CSSProperties;

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

/** Before the first project there is no floor to draw, so the office asks for one. */
function EmptyOffice(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const replayed = useUi((s) => s.replayed);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const ready = connection === "online" && replayed;
  return (
    <div style={{ flex: "1", display: "grid", placeItems: "center", padding: "32px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          maxWidth: "420px",
          textAlign: "center",
          animation: "riseIn .4s cubic-bezier(.2,.9,.3,1.05) both",
        }}
      >
        <div
          style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "700", fontSize: "21px" }}
        >
          {t("app.emptyTitle")}
        </div>
        <div style={{ fontSize: "12.5px", color: "#ABA8A1", lineHeight: "1.7" }}>
          {t("app.emptyBody")}
        </div>
        {ready ? (
          <button
            type="button"
            onClick={() => {
              setAddProjectOpen(true);
            }}
            style={{
              padding: "10px 18px",
              borderRadius: "11px",
              border: "0",
              background: "var(--a,#FFC531)",
              color: "#150F02",
              fontSize: "12.5px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all .22s",
            }}
            className="hopm"
          >
            {t("project.add")}
          </button>
        ) : (
          <div style={{ fontSize: "11.5px", color: "#A6A39C" }}>
            {t(CONNECTION_KEY[connection])}
          </div>
        )}
      </div>
    </div>
  );
}

/** The office: a lit floor on the left and the five panels on the right. */
export function App(): React.JSX.Element {
  const [editorFromUrl] = useState(
    () => DEV && new URLSearchParams(window.location.search).has("editor"),
  );
  const hasFloors = useUi((s) => s.snapshot.projects.size > 0);
  const attachOpen = useDesign((s) => s.attachOpen);
  const usageOpen = useDesign((s) => s.usageOpen);
  const openSelect = useDesign((s) => s.openSelect);
  const floorOpen = useDesign((s) => s.floorOpen);
  const lightbox = useDesign((s) => s.lightbox);
  const editor = useDesign((s) => s.editor);
  const set = useDesign((s) => s.set);
  useSetupAutoOpen();
  useDevReload();

  return (
    <div style={SHELL}>
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
      <Header internal={DEV} hasFloors={hasFloors} />
      <main
        style={{ flex: "1", display: "flex", minHeight: "0", position: "relative", zIndex: 10 }}
      >
        {hasFloors ? (
          <>
            <Stage internal={DEV} />
            <Panel />
          </>
        ) : (
          <EmptyOffice />
        )}
      </main>
      {floorOpen ? (
        <div
          role="presentation"
          onClick={() => {
            set({ floorOpen: false });
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
      {DEV && (editor || editorFromUrl) ? (
        <EditorOverlay
          onClose={() => {
            set({ editor: false });
          }}
        />
      ) : null}
      {lightbox === null ? null : <Lightbox attachment={lightbox} />}
      <AddProject />
      <Setup />
      <Toast />
    </div>
  );
}
