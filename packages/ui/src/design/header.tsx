import { useTranslation } from "react-i18next";
import { ChevronsUpDown, PencilRuler, Settings2 } from "lucide-react";
import { CONNECTION_KEY, useUi } from "../store.ts";
import { type Tab, useDesign } from "./store.ts";
import { DISPLAY, MONO } from "./tokens.ts";
import { Tabs } from "@base-ui/react/tabs";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { FloorMenu } from "./floor-menu.tsx";
import { useFloor, useFloors } from "./live.ts";

function HeaderBrand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-10 flex-[0_0_auto]">
      <div className="w-19 h-19 rounded-6 bg-accent animate-breathe" />
      <span className={`${DISPLAY} font-bold text-12h tracking-brand uppercase whitespace-nowrap`}>
        Home Office
      </span>
    </div>
  );
}

function Connection(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const online = connection === "online";
  const colour = online ? "bg-good" : connection === "connecting" ? "bg-accent" : "bg-bad";
  const label = t(CONNECTION_KEY[connection]);
  return (
    <div
      title={label}
      aria-label={label}
      className={`flex items-center gap-6 p-5 rounded-pill flex-[0_0_auto] ${online ? "bg-good-a10" : "bg-accent-a10"} border ${online ? "border-good-a26" : "border-accent-a26"} transition-[background,border-color] duration-300`}
    >
      <span className="relative w-6 h-6 inline-block">
        <span className={`absolute inset-0 rounded-half ${colour}`} />
        {online ? (
          <span className={`absolute inset-0 rounded-half animate-ring-2400 ${colour}`} />
        ) : null}
      </span>
    </div>
  );
}

const TABS = [
  ["Chat", "nav.chat", "nav.chatHint"],
  ["Board", "nav.board", "nav.boardHint"],
  ["Team", "nav.team", "nav.teamHint"],
  ["Usage", "nav.usage", "nav.usageHint"],
  ["Settings", "nav.settings", "nav.settingsHint"],
] as const satisfies readonly [Tab, string, string][];

const MARKER = "absolute bottom-0 left-0 w-1/5 transition-transform duration-500 ease-spring";

function HeaderTabs(): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useDesign((s) => s.tab);
  const set = useDesign((s) => s.set);
  const slide = {
    "--slide": `${String(TABS.findIndex(([name]) => name === tab) * 100)}%`,
  };

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) => {
        const picked = TABS.find(([name]) => name === next);
        if (picked !== undefined) {
          set({ tab: picked[0], sheet: null });
        }
      }}
      render={<nav />}
      className="w-(--panel) flex-[0_0_var(--panel)] border-l border-line flex relative"
    >
      <Tabs.List aria-label={t("nav.label")} className="flex flex-1 relative">
        <div className={`${MARKER} h-2 bg-accent shadow-tab translate-x-(--slide)`} style={slide} />
        <div
          className={`${MARKER} h-30 bg-[linear-gradient(180deg,var(--color-accent-a00),var(--color-accent-a11))] translate-x-(--slide) pointer-events-none`}
          style={slide}
        />
        {TABS.map(([name, label, hint]) => (
          <Tabs.Tab
            key={name}
            value={name}
            title={t(hint)}
            className={`hover:-translate-y-1 flex-1 border-0 bg-transparent cursor-pointer text-12h font-medium py-1 px-6 whitespace-nowrap transition-[color,transform] duration-250 relative z-2 ${tab === name ? "text-accent-soft" : "text-ink-label"}`}
          >
            {t(label)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

function HeaderFloor(): React.JSX.Element | null {
  const { t } = useTranslation();
  const floors = useFloors();
  const floor = useFloor();
  const set = useDesign((s) => s.set);
  const [open, setOpen] = useState(false);
  if (floor === null) {
    return null;
  }
  const index = floors.findIndex((f) => f.id === floor.id);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          set({ floorQuery: "" });
        }
      }}
    >
      <Popover.Trigger
        title={floor.name}
        aria-label={t("project.floors")}
        className="hover:border-accent-a50 hover:bg-chip-hover hover:-translate-y-1 flex flex-[0_1_auto] items-center gap-9 pt-7 pr-11 pb-7 pl-7 rounded-11 border border-border-strong bg-pop-alt cursor-pointer min-w-0 max-w-full overflow-hidden transition-all duration-220 ease-soft"
      >
        <span
          className={`flex-[0_0_auto] w-19 h-19 grid place-items-center rounded-6 bg-accent text-accent-ink-badge ${MONO} text-10h font-medium`}
        >
          <span>{index + 1}</span>
        </span>
        <span
          className={`flex-[1_1_auto] min-w-0 ${MONO} text-12 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-left`}
        >
          {floor.name}
        </span>
        <ChevronsUpDown size={10} strokeWidth={1.4} className="flex-[0_0_auto] text-ink-meta" />
      </Popover.Trigger>
      <FloorMenu
        onPicked={() => {
          setOpen(false);
        }}
      />
    </Popover.Root>
  );
}

const BAR =
  "flex-[0_0_58px] h-58 flex items-center justify-between bg-header backdrop-blur-[20px] border-b border-line relative z-40";

const TOOL =
  "flex items-center gap-7 py-7 px-12 rounded-10 border border-border-strong bg-transparent cursor-pointer text-12h text-ink-quiet whitespace-nowrap flex-[0_0_auto] transition-all duration-200";

export function Header({
  internal,
  hasFloors,
}: {
  internal: boolean;
  hasFloors: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const set = useDesign((s) => s.set);

  return (
    <header className={BAR}>
      <div className="flex items-center gap-13 pl-18 flex-[1_1_auto] min-w-0">
        <HeaderBrand />
        <Connection />
        {hasFloors ? <HeaderFloor /> : null}
      </div>
      <div className="flex items-stretch h-full flex-[0_0_auto]">
        <div className="flex items-center gap-7 pr-16 flex-[0_0_auto]">
          {internal ? (
            <button
              type="button"
              onClick={() => {
                set({ editor: true });
              }}
              className={`hover:text-ink hover:border-border-hover hover:bg-raised ${TOOL}`}
            >
              <PencilRuler size={12} strokeWidth={1.4} />
              {t("app.editorButton")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSetupOpen(true);
            }}
            className={`hover:text-ink hover:border-border-hover hover:bg-raised ${TOOL}`}
          >
            <Settings2 size={12} strokeWidth={1.4} />
            {t("app.setup")}
          </button>
        </div>
        {hasFloors ? <HeaderTabs /> : null}
      </div>
    </header>
  );
}
