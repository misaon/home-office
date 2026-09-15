import { Tabs } from "@base-ui/react/tabs";
import { useTranslation } from "react-i18next";
import { useDesign, type Tab } from "./store.ts";

const TABS = [
  ["Chat", "nav.chat", "nav.chatHint"],
  ["Board", "nav.board", "nav.boardHint"],
  ["Team", "nav.team", "nav.teamHint"],
  ["Usage", "nav.usage", "nav.usageHint"],
  ["Settings", "nav.settings", "nav.settingsHint"],
] as const satisfies readonly [Tab, string, string][];

const MARKER = "absolute bottom-0 left-0 w-1/5 transition-transform duration-500 ease-spring";

/** The five panels, and the lit bar that slides to whichever one is open. */
export function HeaderTabs(): React.JSX.Element {
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
      className="w-420 flex-[0_0_420px] border-l border-line flex relative"
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
