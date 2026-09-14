import type { ProjectId } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevReload } from "./dev-reload.ts";
import { EditorOverlay } from "./editor/overlay.tsx";
import { Button } from "./kit/controls.tsx";
import { OfficeCanvas } from "./office/office-canvas.tsx";
import { AddProjectModal } from "./panels/add-project.tsx";
import { BoardPanel } from "./panels/board.tsx";
import { ChatPanel } from "./panels/chat.tsx";
import { SettingsPanel } from "./panels/settings.tsx";
import { TeamPanel } from "./panels/team.tsx";
import { UsagePanel } from "./panels/usage.tsx";
import { SetupOverlay, useSetupAutoOpen } from "./setup/overlay.tsx";
import { CONNECTION_KEY, type Panel, sortedFloors, useUi } from "./store.ts";

/** The office editor is an internal tool: this is replaced by a constant at build time, so a production
 * bundle contains neither the branch nor the import. */
const DEV = process.env.NODE_ENV === "development";

/** The bar above the office and the panel tabs beside it are one line of chrome, so they are one height. */
const BAR = "h-13 shrink-0 border-b border-line bg-panel/80 backdrop-blur-sm";

const PANELS = [
  { id: "chat", label: "nav.chat", hint: "nav.chatHint" },
  { id: "board", label: "nav.board", hint: "nav.boardHint" },
  { id: "team", label: "nav.team", hint: "nav.teamHint" },
  { id: "usage", label: "nav.usage", hint: "nav.usageHint" },
  { id: "settings", label: "nav.settings", hint: "nav.settingsHint" },
] as const satisfies readonly { id: Panel; label: string; hint: string }[];

const VIEWS: Record<Panel, () => React.JSX.Element> = {
  chat: ChatPanel,
  board: BoardPanel,
  team: TeamPanel,
  usage: UsagePanel,
  settings: SettingsPanel,
};

/**
 * The panel that is open. Its key makes React mount a fresh tree on every switch, which is what lets the
 * content arrive with its own animation instead of swapping in place — and it drops the per-floor drafts
 * a chat or a settings form was holding.
 */
function PanelBody({ panel }: { panel: Panel }): React.JSX.Element {
  const View = VIEWS[panel];
  const floorId = useUi((s) => s.floorId);
  return (
    <div key={`${panel}-${floorId ?? ""}`} className="animate-slide h-full">
      <View />
    </div>
  );
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
          className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs active:scale-[0.98] ${
            p.id === floorId
              ? "border-accent/50 bg-accent-soft text-accent shadow-glow"
              : "border-line bg-raised text-muted hover:border-line-strong hover:text-text"
          }`}
          onClick={() => {
            selectFloor(p.id);
          }}
        >
          <span className="font-mono text-2xs opacity-70">{String(i + 1)}</span>
          <span className="max-w-40 truncate">{p.name}</span>
        </button>
      ))}
      <button
        type="button"
        className="shrink-0 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-faint hover:border-accent/50 hover:text-accent active:scale-[0.98]"
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

/** Before the first project: one invitation, on the office's own ground. */
function EmptyOffice(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const replayed = useUi((s) => s.replayed);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const ready = connection === "online" && replayed;
  return (
    <div className="flex h-full items-center justify-center bg-ink">
      <div className="animate-rise flex max-w-sm flex-col items-center gap-4 px-8 text-center">
        <p className="text-lg font-semibold">{t("app.emptyTitle")}</p>
        <p className="text-xs leading-relaxed text-muted">{t("app.emptyBody")}</p>
        {ready ? (
          <Button
            variant="primary"
            onClick={() => {
              setAddProjectOpen(true);
            }}
          >
            {t("project.add")}
          </Button>
        ) : (
          <p className="text-xs text-faint">{t(CONNECTION_KEY[connection])}</p>
        )}
      </div>
    </div>
  );
}

/** Online, connecting or gone, in one dot that changes colour rather than appearing and disappearing. */
function Connection(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const online = connection === "online";
  return (
    <span
      className="flex shrink-0 items-center"
      title={t(CONNECTION_KEY[connection])}
      aria-label={t(CONNECTION_KEY[connection])}
    >
      <span className="relative flex h-2 w-2">
        {online ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
        ) : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-[var(--duration-base)] ${
            online ? "bg-good" : connection === "connecting" ? "bg-warn" : "bg-bad"
          }`}
        />
      </span>
    </span>
  );
}

export function App(): React.JSX.Element {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(
    () => DEV && new URLSearchParams(window.location.search).has("editor"),
  );
  const panel = useUi((s) => s.panel);
  const selectPanel = useUi((s) => s.selectPanel);
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
          <span className="shrink-0 font-semibold tracking-tight">Home Office</span>
          <Connection />
          {hasFloors ? <FloorTabs floorId={floorId} /> : null}
          <span className="ml-auto flex shrink-0 gap-2">
            {DEV ? (
              <Button
                variant="ghost"
                title={t("app.editor")}
                onClick={() => {
                  setEditor(true);
                }}
              >
                {t("app.editorButton")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              title={t("app.setupSummary")}
              onClick={() => {
                setSetupOpen(true);
              }}
            >
              {t("app.setup")}
            </Button>
          </span>
        </header>
        <div className="min-h-0 flex-1">{hasFloors ? <OfficeCanvas /> : <EmptyOffice />}</div>
      </main>
      {hasFloors ? (
        <aside className="flex w-[460px] shrink-0 flex-col border-l border-line bg-ink">
          <nav className={`flex ${BAR}`} aria-label={t("nav.label")}>
            {PANELS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === panel}
                title={t(p.hint)}
                className={`group relative flex-1 px-2 text-xs ${
                  p.id === panel ? "text-text" : "text-muted hover:text-text"
                }`}
                onClick={() => {
                  selectPanel(p.id);
                }}
              >
                {t(p.label)}
                {/* The mark under the open tab grows into place instead of jumping between tabs. */}
                <span
                  className={`absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-accent transition-transform duration-[var(--duration-base)] ease-[var(--ease-soft)] ${
                    p.id === panel ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"
                  }`}
                />
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
