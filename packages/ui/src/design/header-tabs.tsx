import { useDesign, type Tab } from "./store.ts";

const TABS: Tab[] = ["Chat", "Board", "Team", "Usage", "Settings"];

const MARKER: React.CSSProperties = {
  position: "absolute",
  bottom: "0",
  left: "0",
  width: "20%",
  transition: "transform .5s cubic-bezier(.34,1.4,.5,1)",
};

/** The five panels, and the lit bar that slides to whichever one is open. */
export function HeaderTabs(): React.JSX.Element {
  const tab = useDesign((s) => s.tab);
  const set = useDesign((s) => s.set);
  const slide = `translateX(${String(TABS.indexOf(tab) * 100)}%)`;

  return (
    <nav
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
      {TABS.map((name) => (
        <button
          type="button"
          key={name}
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
          {name}
        </button>
      ))}
    </nav>
  );
}
