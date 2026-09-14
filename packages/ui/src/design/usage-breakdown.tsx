import { DISPLAY, MONO, separator } from "./tokens.ts";

export type Row = { name: string; total: string; pct: string; detail: string; cache: string };

const HEADING: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const CARD: React.CSSProperties = {
  borderRadius: "14px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
};

const NAME: React.CSSProperties = {
  ...MONO,
  fontSize: "12px",
  color: "#E4E1DB",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "45%",
};

const LANE: React.CSSProperties = {
  flex: "1",
  height: "4px",
  borderRadius: "99px",
  background: "#1F1F24",
  overflow: "hidden",
  minWidth: "40px",
};

const FILL: React.CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: "99px",
  background: "linear-gradient(90deg,#E0A400,var(--a,#FFC531))",
  transformOrigin: "left",
  animation: "growX .9s cubic-bezier(.2,.9,.3,1) both",
};

const TOTAL: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "600",
  fontSize: "13px",
  color: "#FFD666",
  flex: "0 0 auto",
};

const DETAIL: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "9px",
  marginTop: "7px",
  ...MONO,
  fontSize: "10px",
  color: "#A6A39C",
};

/** One way of slicing the spend: a name, its share as a bar, and its total. */
export function Breakdown({ name, rows }: { name: string; rows: Row[] }): React.JSX.Element {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}>
        <span style={HEADING}>{name}</span>
        <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
      </div>
      <div style={CARD}>
        {rows.map((row, i) => (
          <div
            key={row.name}
            style={{
              padding: "12px 13px",
              borderTop: `1px solid ${separator(i === 0)}`,
              transition: "background .2s",
            }}
            className="ho-0b4177"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
              <span style={NAME}>{row.name}</span>
              <span style={LANE}>
                <span style={{ ...FILL, width: row.pct }} />
              </span>
              <span style={TOTAL}>{row.total}</span>
            </div>
            <div style={DETAIL}>
              <span>{row.detail}</span>
              <span>{row.cache}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
