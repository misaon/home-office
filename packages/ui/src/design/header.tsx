import { HeaderBrand } from "./header-brand.tsx";
import { HeaderFloor } from "./header-floor.tsx";
import { HeaderTabs } from "./header-tabs.tsx";
import { useDesign } from "./store.ts";

const BAR: React.CSSProperties = {
  flex: "0 0 58px",
  height: "58px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "rgba(10,10,11,.78)",
  backdropFilter: "blur(20px)",
  borderBottom: "1px solid #1B1B1F",
  position: "relative",
  zIndex: 40,
};

const TOOL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "7px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "transparent",
  cursor: "pointer",
  fontSize: "12.5px",
  color: "#CFCCC6",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  transition: "all .2s",
};

/** The office's own top bar: who you are looking at, and which of the five panels is open. */
export function Header({ internal }: { internal: boolean }): React.JSX.Element {
  const set = useDesign((s) => s.set);

  return (
    <header style={BAR}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "13px",
          paddingLeft: "18px",
          flex: "1 1 auto",
          minWidth: "0",
        }}
      >
        <HeaderBrand />
        <HeaderFloor />
      </div>
      <div style={{ display: "flex", alignItems: "stretch", height: "100%", flex: "0 0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            paddingRight: "16px",
            flex: "0 0 auto",
          }}
        >
          {internal ? (
            <button
              type="button"
              onClick={() => {
                set({ editor: true });
              }}
              style={TOOL}
              className="hop3"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <rect x="1.6" y="1.6" width="10.8" height="10.8" rx="2" />
                <line x1="1.6" y1="5.4" x2="12.4" y2="5.4" />
                <line x1="5.4" y1="5.4" x2="5.4" y2="12.4" />
              </svg>
              Editor
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              set({ setup: true });
            }}
            style={TOOL}
            className="hop3"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <circle cx="7" cy="7" r="2.4" />
              <circle cx="7" cy="7" r="5.4" />
            </svg>
            Setup
          </button>
        </div>
        <HeaderTabs />
      </div>
    </header>
  );
}
