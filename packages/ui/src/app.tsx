import { FloorTabs } from "./office/floor-tabs.tsx";
import { OfficeCanvas } from "./office/office-canvas.tsx";
import { BoardPanel } from "./panels/board.tsx";
import { ChatPanel } from "./panels/chat.tsx";
import { InspectorPanel } from "./panels/inspector.tsx";
import { ResourcesPanel } from "./panels/resources.tsx";
import { SettingsPanel } from "./panels/settings.tsx";
import { UsagePanel } from "./panels/usage.tsx";
import { SetupOverlay, useSetupAutoOpen } from "./setup/overlay.tsx";
import { type Panel, useUi } from "./store.ts";

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
  return <View />;
}

export function App(): React.JSX.Element {
  const panel = useUi((s) => s.panel);
  const selectPanel = useUi((s) => s.selectPanel);
  const connection = useUi((s) => s.connection);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  useSetupAutoOpen();
  return (
    <div className="relative flex h-full">
      <SetupOverlay />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-panel px-3 py-1">
          <span className="font-semibold tracking-wide">Home Office</span>
          <span
            className={`h-2 w-2 rounded-full ${connection === "online" ? "bg-emerald-400" : "bg-red-400"}`}
            title={connection}
          />
          <FloorTabs />
          <button
            type="button"
            className="ml-auto rounded bg-panel px-2 py-1 text-xs text-gray-300 hover:bg-line"
            title="Docker, images, token, team, smoke test"
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
      <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-ink">
        <nav className="flex border-b border-line bg-panel">
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`flex-1 px-2 py-2 text-xs ${
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
