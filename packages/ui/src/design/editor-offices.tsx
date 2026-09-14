import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const SAVED = [
  { i: "B", name: "Base", size: "60×34" },
  { i: "L", name: "Loft floor", size: "48×28" },
];

const ROW: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "12px",
  borderRadius: "12px",
  background: "#111114",
  border: "1px solid #26262C",
  marginBottom: "9px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all .22s",
};

const BADGE: React.CSSProperties = {
  width: "26px",
  height: "26px",
  flex: "0 0 26px",
  borderRadius: "8px",
  background: "#24242A",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "10px",
  color: "#BEBBB4",
};

const NAME: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  fontSize: "13px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const SAVE: React.CSSProperties = {
  width: "100%",
  marginTop: "5px",
  padding: "12px",
  borderRadius: "12px",
  border: "0",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all .22s",
};

const DROP: React.CSSProperties = {
  marginTop: "14px",
  padding: "13px",
  borderRadius: "12px",
  border: "1px dashed #34343B",
  textAlign: "center",
};

const CHOOSE: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "9px",
  border: "1px solid #2C2C32",
  background: "#141417",
  fontSize: "12px",
  color: "#D6D3CD",
  cursor: "pointer",
  transition: "all .2s",
};

/** The offices already drawn, the button that keeps this one, and the door to a file on disk. */
export function EditorOffices(): React.JSX.Element {
  const officeFile = useDesign((s) => s.officeFile);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);

  return (
    <>
      {SAVED.map((office) => (
        <button
          type="button"
          key={office.name}
          onClick={() => {
            set({
              officeName: office.name,
              officeFile: `layouts/${office.name.toLowerCase().replaceAll(" ", "-")}.json`,
            });
            flash(`${office.name} loaded into the editor`);
          }}
          style={ROW}
          className="hopq"
        >
          <span style={BADGE}>
            <span>{office.i}</span>
          </span>
          <span style={NAME}>{office.name}</span>
          <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C", flex: "0 0 auto" }}>
            {office.size}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          set({ editor: false });
          flash(`Saved to ${officeFile}`);
        }}
        style={SAVE}
        className="hopr"
      >
        Save office
      </button>
      <div style={DROP}>
        <div style={{ fontSize: "12px", color: "#BEBBB4", marginBottom: "9px" }}>
          Load an office from a JSON file
        </div>
        <button
          type="button"
          onClick={() => {
            flash("File picker opens on the desktop app");
          }}
          style={CHOOSE}
          className="hops"
        >
          Choose a file
        </button>
      </div>
    </>
  );
}
