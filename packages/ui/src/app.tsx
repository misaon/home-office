import type { ProjectId } from "@ho/protocol";
import { useDevReload } from "./dev-reload.ts";
import { OfficeCanvas } from "./office/office-canvas.tsx";
import { AddProjectModal } from "./panels/add-project.tsx";
import { BoardPanel } from "./panels/board.tsx";
import { ChatPanel } from "./panels/chat.tsx";
import { InspectorPanel } from "./panels/inspector.tsx";
import { ResourcesPanel } from "./panels/resources.tsx";
import { SettingsPanel } from "./panels/settings.tsx";
import { UsagePanel } from "./panels/usage.tsx";
import { SetupOverlay, useSetupAutoOpen } from "./setup/overlay.tsx";
import { type Panel, sortedFloors, useUi } from "./store.ts";

const PANELS: { id: Panel; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "board", label: "Board" },
  { id: "inspector", label: "Agent" },
  { id: "usage", label: "Usage" },
  { id: "resources", label: "Resources" },
  { id: "settings", label: "Settings" },
];

const VIEWS: Record<Panel, () => React.JSX.Element> = {
  chat: ChatPanel,
  board: BoardPanel,
  inspector: InspectorPanel,
  usage: UsagePanel,
  resources: ResourcesPanel,
  settings: SettingsPanel,
};

function PanelBody({ panel }: { panel: Panel }): React.JSX.Element {
  const View = VIEWS[panel];
  const floorId = useUi((s) => s.floorId);
  return <View key={panel === "chat" || panel === "settings" ? floorId : panel} />;
}

const CONNECTION_TEXT = {
  connecting: "Connecting to the daemon…",
  online: "Connected",
  offline: "Daemon offline — retrying…",
  unauthorized: "This page carries no daemon token. Run `ho ui` to open the office with it.",
  rejected:
    "The daemon refused this page's token — it mints a new one every launch. Run `ho ui` again to reconnect.",
} as const;

/** Floor tabs in the header: numbered by creation, the "+" adds a project (a new floor). */
function FloorTabs({ floorId }: { floorId: ProjectId | null }): React.JSX.Element {
  const projects = useUi((s) => s.snapshot.projects);
  const selectFloor = useUi((s) => s.selectFloor);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  return (
    <nav className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      {sortedFloors(projects).map((p, i) => (
        <button
          key={p.id}
          type="button"
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
        title="Add a project (a new floor)"
        onClick={() => {
          setAddProjectOpen(true);
        }}
      >
        +
      </button>
    </nav>
  );
}

/** Before the first project: a black screen with one button. Setup stays reachable in the corner. */
function EmptyOffice(): React.JSX.Element {
  const connection = useUi((s) => s.connection);
  const replayed = useUi((s) => s.replayed);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const ready = connection === "online" && replayed;
  return (
    <div className="relative flex h-full items-center justify-center bg-black">
      {ready ? (
        <button
          type="button"
          className="rounded-lg bg-accent px-8 py-4 text-base font-semibold text-black shadow-lg transition hover:brightness-110"
          onClick={() => {
            setAddProjectOpen(true);
          }}
        >
          Add a project (floor)
        </button>
      ) : (
        <p className="text-sm text-gray-500">{CONNECTION_TEXT[connection]}</p>
      )}
      <div className="absolute right-5 bottom-4 flex items-center gap-3 text-xs text-gray-500">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connection === "online" ? "bg-emerald-500" : "bg-red-500"}`}
        />
        <button
          type="button"
          className="hover:text-gray-300"
          onClick={() => {
            setSetupOpen(true);
          }}
        >
          Setup
        </button>
      </div>
    </div>
  );
}

export function App(): React.JSX.Element {
  const panel = useUi((s) => s.panel);
  const selectPanel = useUi((s) => s.selectPanel);
  const connection = useUi((s) => s.connection);
  const floorId = useUi((s) => s.floorId);
  const hasFloors = useUi((s) => s.snapshot.projects.size > 0);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  useSetupAutoOpen();
  useDevReload();
  if (!hasFloors) {
    return (
      <div className="relative h-full">
        <SetupOverlay />
        <AddProjectModal />
        <EmptyOffice />
      </div>
    );
  }
  return (
    <div className="relative flex h-full">
      <SetupOverlay />
      <AddProjectModal />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
          <span className="shrink-0 font-semibold tracking-wide">Home Office</span>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${connection === "online" ? "bg-emerald-400" : "bg-red-400"}`}
            title={CONNECTION_TEXT[connection]}
          />
          <FloorTabs floorId={floorId} />
          <button
            type="button"
            className="ml-auto shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-gray-300 hover:bg-line"
            title="Docker, images, token, smoke test"
            onClick={() => {
              setSetupOpen(true);
            }}
          >
            Setup
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <OfficeCanvas />
        </div>
      </main>
      <aside className="flex w-[440px] shrink-0 flex-col border-l border-line bg-ink">
        <nav className="flex border-b border-line bg-panel">
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`flex-1 px-2 py-3 text-xs transition ${
                p.id === panel
                  ? "border-b-2 border-accent text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              onClick={() => {
                selectPanel(p.id);
              }}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PanelBody panel={panel} />
        </div>
      </aside>
    </div>
  );
}
