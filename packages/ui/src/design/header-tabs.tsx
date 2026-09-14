import { useTranslation } from "react-i18next";
import { useDesign, type Tab } from "./store.ts";

const TABS = [
  ["Chat", "nav.chat", "nav.chatHint"],
  ["Board", "nav.board", "nav.boardHint"],
  ["Team", "nav.team", "nav.teamHint"],
  ["Usage", "nav.usage", "nav.usageHint"],
  ["Settings", "nav.settings", "nav.settingsHint"],
] as const satisfies readonly [Tab, string, string][];

const MARKER: React.CSSProperties = {
  position: "absolute",
  bottom: "0",
  left: "0",
  width: "20%",
  transition: "transform .5s cubic-bezier(.34,1.4,.5,1)",
};

/** The five panels, and the lit bar that slides to whichever one is open. */
export function HeaderTabs(): React.JSX.Element {
  const { t } = useTranslation();
  const tab = useDesign((s) => s.tab);
  const set = useDesign((s) => s.set);
  const slide = `translateX(${String(TABS.findIndex(([name]) => name === tab) * 100)}%)`;

  return (
    <nav
      aria-label={t("nav.label")}
      style={{
        width: "var(--pw,420px)",
        flex: "0 0 var(--pw,420px)",
        borderLeft: "1px solid #1B1B1F",
        display: "flex",
        position: "relative",
      }}
    >
      <div
        style={{
          ...MARKER,
          height: "2px",
          background: "var(--a,#FFC531)",
          boxShadow: "0 0 14px 1px rgba(255,197,49,.75)",
          transform: slide,
        }}
      />
      <div
        style={{
          ...MARKER,
          height: "30px",
          background: "linear-gradient(180deg,rgba(255,197,49,0),rgba(255,197,49,.11))",
          transform: slide,
          pointerEvents: "none",
        }}
      />
      {TABS.map(([name, label, hint]) => (
        <button
          type="button"
          key={name}
          title={t(hint)}
          onClick={() => {
            set({ tab: name, sheet: null, openSelect: null });
          }}
          style={{
            flex: "1",
            border: "0",
            background: "transparent",
            cursor: "pointer",
            fontSize: "12.5px",
            fontWeight: "500",
            whiteSpace: "nowrap",
            transition: "color .25s,transform .25s",
            position: "relative",
            zIndex: 2,
            color: tab === name ? "#FFD666" : "#ABA8A1",
          }}
          className="hop4"
        >
          {t(label)}
        </button>
      ))}
    </nav>
  );
}
