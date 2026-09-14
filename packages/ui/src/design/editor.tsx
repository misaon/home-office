import { EditorOffices } from "./editor-offices.tsx";
import { EditorTools, Rule } from "./editor-tools.tsx";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const DRAWER: React.CSSProperties = {
  position: "absolute",
  top: "0",
  bottom: "0",
  left: "0",
  width: "min(360px,86%)",
  background: "#0C0C0E",
  borderRight: "1px solid #26262C",
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
  boxShadow: "40px 0 80px rgba(0,0,0,.55)",
  animation: "drawerIn .42s cubic-bezier(.2,.9,.3,1) both",
};

const HEAD: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "16px 16px 14px",
  borderBottom: "1px solid #1B1B1F",
};

const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#101013",
};

const slug = (name: string): string =>
  `layouts/${name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/u, "")}.json`;

/** The internal office editor, in the drawer it lives in: what to draw with and what to draw on. */
export function Editor(): React.JSX.Element {
  const officeName = useDesign((s) => s.officeName);
  const officeFile = useDesign((s) => s.officeFile);
  const set = useDesign((s) => s.set);

  return (
    <div style={DRAWER}>
      <div style={HEAD}>
        <div style={{ minWidth: "0" }}>
          <div
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: "600",
              fontSize: "15px",
            }}
          >
            Office editor
          </div>
          <div
            style={{
              ...MONO,
              fontSize: "9.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#FFD666",
              marginTop: "3px",
            }}
          >
            internal only
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            set({ editor: false });
          }}
          style={{
            padding: "6px 12px",
            borderRadius: "9px",
            border: "1px solid #2C2C32",
            background: "transparent",
            fontSize: "12px",
            color: "#CFCCC6",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all .2s",
          }}
          className="hop3"
        >
          Close
        </button>
      </div>
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "16px" }}>
        <Rule name="office" />
        <div style={{ fontSize: "12px", color: "#BEBBB4", marginBottom: "7px" }}>Name</div>
        <input
          value={officeName}
          onChange={(e) => {
            const name = e.target.value;
            set({ officeName: name, officeFile: slug(name) });
          }}
          style={{ ...FIELD, fontSize: "13px", marginBottom: "13px" }}
        />
        <div style={{ fontSize: "12px", color: "#BEBBB4", marginBottom: "7px" }}>File</div>
        <input
          value={officeFile}
          onChange={(e) => {
            set({ officeFile: e.target.value });
          }}
          style={{ ...FIELD, ...MONO, fontSize: "11.5px" }}
        />
        <div
          style={{
            ...MONO,
            fontSize: "10.5px",
            color: "#A6A39C",
            margin: "8px 0 16px",
            lineHeight: "1.7",
          }}
        >
          60 × 34 cells · 0 wall runs · 0 rooms · 0 doors · 0 furniture
        </div>
        <EditorTools />
        <Rule name="saved offices" />
        <EditorOffices />
      </div>
    </div>
  );
}
