import { MONO, seg } from "./tokens.ts";
import { useDesign } from "./store.ts";

const TOOLS = ["Wall", "Room", "Door", "Furniture"];
const MATERIALS = ["Brick", "Glass", "Concrete", "Oak floor", "Carpet", "Steel"];

const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#101013",
};

const RULE_LABEL: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const SEGMENTED: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  padding: "3px",
  borderRadius: "11px",
  background: "#101013",
  border: "1px solid #26262C",
  marginBottom: "16px",
};

const SWATCH: React.CSSProperties = {
  padding: "11px",
  borderRadius: "11px",
  cursor: "pointer",
  fontSize: "12.5px",
  textAlign: "left",
  transition: "all .22s",
};

/** A rule with a name, and sometimes a count on its right. */
export function Rule({ name, count }: { name: string; count?: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px" }}>
      <span style={RULE_LABEL}>{name}</span>
      <span style={{ flex: "1", height: "1px", background: "#232328" }} />
      {count === undefined ? null : (
        <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>{count}</span>
      )}
    </div>
  );
}

/** What you draw with, and what you draw it in. */
export function EditorTools(): React.JSX.Element {
  const tool = useDesign((s) => s.tool);
  const matQuery = useDesign((s) => s.matQuery);
  const material = useDesign((s) => s.material);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const matches = MATERIALS.filter((m) => m.toLowerCase().includes(matQuery.trim().toLowerCase()));

  return (
    <>
      <Rule name="tool" />
      <div style={SEGMENTED}>
        {TOOLS.map((name) => {
          const tone = seg(tool === name);
          return (
            <button
              type="button"
              key={name}
              onClick={() => {
                set({ tool: name });
              }}
              style={{
                flex: "1",
                padding: "8px 0",
                borderRadius: "8px",
                border: "0",
                cursor: "pointer",
                fontSize: "12px",
                transition: "all .25s",
                background: tone.bg,
                color: tone.fg,
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <Rule name="material" count={String(matches.length)} />
      <input
        value={matQuery}
        onChange={(e) => {
          set({ matQuery: e.target.value });
        }}
        placeholder="search…"
        style={{ ...FIELD, fontSize: "12.5px", marginBottom: "10px" }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "9px",
          marginBottom: "12px",
        }}
      >
        {matches.map((name) => {
          const on = material === name;
          return (
            <button
              type="button"
              key={name}
              onClick={() => {
                set({ material: name });
                flash(`${name} selected`);
              }}
              style={{
                ...SWATCH,
                border: `1px solid ${on ? "rgba(255,197,49,.55)" : "#2C2C32"}`,
                background: on ? "rgba(255,197,49,.1)" : "#101013",
                color: on ? "#FFD666" : "#CFCCC6",
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div
        style={{ fontSize: "11.5px", color: "#A6A39C", lineHeight: "1.7", marginBottom: "20px" }}
      >
        Drag with the left button to paint, right button to erase. Middle button or shift pans; the
        wheel zooms.
      </div>
    </>
  );
}
