import type { ProjectId } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevReload } from "./dev-reload.ts";
import { EditorOverlay } from "./editor/overlay.tsx";
import { OfficeCanvas } from "./office/office-canvas.tsx";
import { AddProjectModal } from "./panels/add-project.tsx";
import { BoardPanel } from "./panels/board.tsx";
import { ChatPanel } from "./panels/chat.tsx";
import { InspectorPanel } from "./panels/inspector.tsx";
import { ResourcesPanel } from "./panels/resources.tsx";
import { SettingsPanel } from "./panels/settings.tsx";
import { UsagePanel } from "./panels/usage.tsx";
import { SetupOverlay, useSetupAutoOpen } from "./setup/overlay.tsx";
import { CONNECTION_KEY, type Panel, sortedFloors, useUi } from "./store.ts";

/** The office editor is an internal tool: this is replaced by a constant at build time, so a production
 * bundle contains neither the branch nor the import. */
const DEV = process.env.NODE_ENV === "development";

const PANELS = [
  { id: "chat", label: "nav.chat" },
  { id: "board", label: "nav.board" },
  { id: "inspector", label: "nav.agent" },
  { id: "usage", label: "nav.usage" },
  { id: "resources", label: "nav.resources" },
  { id: "settings", label: "nav.settings" },
] as const satisfies readonly { id: Panel; label: string }[];

const VIEWS: Record<Panel, () => React.JSX.Element> = {
  chat: ChatPanel,
  board: BoardPanel,
  inspector: InspectorPanel,
  usage: UsagePanel,
  resources: ResourcesPanel,
  settings: SettingsPanel,
};

/** The chat and settings panels hold per-floor drafts, so switching floors remounts them. */
function PanelBody({ panel }: { panel: Panel }): React.JSX.Element {
  const View = VIEWS[panel];
  const floorId = useUi((s) => s.floorId);
  return <View key={panel === "chat" || panel === "settings" ? floorId : panel} />;
}

/** Floor tabs in the header: numbered by creation, the "+" adds a project (a new floor). */
function FloorTabs({ floorId }: { floorId: ProjectId | null }): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const selectFloor = useUi((s) => s.selectFloor);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  return (
    <nav className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      {sortedFloors(projects).map((p, i) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={p.id === floorId}
          title={p.repo.kind === "local" ? p.repo.path : p.repo.url}
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
            p.id === floorId ? "bg-accent text-black" : "bg-ink text-gray-300 hover:bg-line"
          }`}
          onClick={() => {
            selectFloor(p.id);
          }}
        >
          <span className="font-semibold">{String(i + 1)}</span>
          <span className="max-w-40 truncate">{p.name}</span>
        </button>
      ))}
      <button
        type="button"
        className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs text-gray-300 hover:bg-line"
        title={t("app.addProject")}
        onClick={() => {
          setAddProjectOpen(true);
        }}
      >
        +
      </button>
    </nav>
  );
}

/** Before the first project: a black screen with one button. */
function EmptyOffice(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const replayed = useUi((s) => s.replayed);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  return (
    <div className="flex h-full items-center justify-center bg-black">
      {connection === "online" && replayed ? (
        <button
          type="button"
          className="rounded-lg bg-accent px-8 py-4 text-base font-semibold text-black shadow-lg transition hover:brightness-110"
          onClick={() => {
            setAddProjectOpen(true);
          }}
        >
          {t("project.add")}
        </button>
      ) : (
        <p className="text-sm text-gray-500">{t(CONNECTION_KEY[connection])}</p>
      )}
    </div>
  );
}

/** The bar above the office and the panel tabs beside it are one line of chrome, so they are one height. */
const BAR = "h-12.5 shrink-0 border-b border-line bg-panel";

const HEADER_BUTTON =
  "shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-gray-300 hover:bg-line";

export function App(): React.JSX.Element {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(
    () => DEV && new URLSearchParams(window.location.search).has("editor"),
  );
  const panel = useUi((s) => s.panel);
  const selectPanel = useUi((s) => s.selectPanel);
  const connection = useUi((s) => s.connection);
  const floorId = useUi((s) => s.floorId);
  const hasFloors = useUi((s) => s.snapshot.projects.size > 0);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  useSetupAutoOpen();
  useDevReload();
  return (
    <div className="relative flex h-full">
      <SetupOverlay />
      <AddProjectModal />
      {DEV && editor ? (
        <EditorOverlay
          onClose={() => {
            setEditor(false);
          }}
        />
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className={`flex items-center gap-4 px-4 ${BAR}`}>
          <span className="shrink-0 font-semibold tracking-wide">Home Office</span>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${connection === "online" ? "bg-emerald-400" : "bg-red-400"}`}
            title={t(CONNECTION_KEY[connection])}
          />
          {hasFloors ? <FloorTabs floorId={floorId} /> : null}
          <span className="ml-auto flex shrink-0 gap-2">
            {DEV ? (
              <button
                type="button"
                className={HEADER_BUTTON}
                title={t("app.editor")}
                onClick={() => {
                  setEditor(true);
                }}
              >
                {t("app.editorButton")}
              </button>
            ) : null}
            <button
              type="button"
              className={HEADER_BUTTON}
              title={t("app.setupSummary")}
              onClick={() => {
                setSetupOpen(true);
              }}
            >
              {t("app.setup")}
            </button>
          </span>
        </header>
        <div className="min-h-0 flex-1">{hasFloors ? <OfficeCanvas /> : <EmptyOffice />}</div>
      </main>
      {hasFloors ? (
        <aside className="flex w-[440px] shrink-0 flex-col border-l border-line bg-ink">
          <nav className={`flex ${BAR}`}>
            {PANELS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === panel}
                className={`flex-1 px-2 text-xs transition ${
                  p.id === panel
                    ? "border-b-2 border-accent text-white"
                    : "text-gray-400 hover:text-white"
                }`}
                onClick={() => {
                  selectPanel(p.id);
                }}
              >
                {t(p.label)}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PanelBody panel={panel} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
