import { DISPLAY } from "./tokens.ts";
import { useDesign } from "./store.ts";

const SHELL: React.CSSProperties = {
  position: "absolute",
  inset: "0",
  zIndex: 30,
  background: "#0B0B0D",
  display: "flex",
  flexDirection: "column",
  animation: "slideLeft .36s cubic-bezier(.2,.8,.3,1) both",
};

export const PRIMARY: React.CSSProperties = {
  flex: "1",
  padding: "11px",
  borderRadius: "11px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "12.5px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all .22s",
};

export const CAPS: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "10px",
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

export const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
};

/** A sheet slides over the panel it came from: a back arrow, a title, and the body under it. */
export function SheetShell({
  title,
  subtitle,
  titleStyle,
  children,
}: {
  title: string;
  subtitle?: string;
  titleStyle?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  const set = useDesign((s) => s.set);
  return (
    <div style={SHELL}>
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: "11px",
          padding: "14px 16px",
          borderBottom: "1px solid #1B1B1F",
        }}
      >
        <button
          aria-label="Back"
          type="button"
          onClick={() => {
            set({ sheet: null, sheetDraft: null, openSelect: null });
          }}
          style={{
            width: "30px",
            height: "30px",
            flex: "0 0 30px",
            display: "grid",
            placeItems: "center",
            border: "1px solid #2C2C32",
            borderRadius: "9px",
            background: "transparent",
            color: "#CFCCC6",
            cursor: "pointer",
            transition: "all .2s",
          }}
          className="hop8"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <polyline points="7.5,2.5 4,6 7.5,9.5" />
          </svg>
        </button>
        <div style={{ flex: "1", minWidth: "0" }}>
          <div style={{ ...DISPLAY, fontWeight: "600", fontSize: "15px", ...titleStyle }}>
            {title}
          </div>
          {subtitle === undefined ? null : (
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "10.5px",
                color: "#ABA8A1",
                marginTop: "2px",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "16px" }}>
        {children}
      </div>
    </div>
  );
}
