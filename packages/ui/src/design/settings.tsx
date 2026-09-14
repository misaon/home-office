import { LanguageCard } from "./settings-language.tsx";
import { SettingsCreds } from "./settings-creds.tsx";
import { SettingsFloor } from "./settings-floor.tsx";
import { DISPLAY, MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const HEADING: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

/** A section rule with its name on the left and its count on the right. */
function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}>
      <span style={HEADING}>{name}</span>
      <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
      <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>{count}</span>
    </div>
  );
}

/** The office itself: the language it speaks, the keys it holds and the floors it has. */
export function Settings(): React.JSX.Element {
  const creds = useDesign((s) => s.creds);
  const floors = useDesign((s) => s.floors);
  const addFloor = useDesign((s) => s.addFloor);

  return (
    <div
      style={{
        flex: "1",
        minHeight: "0",
        overflowY: "auto",
        animation: "slideLeft .42s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      <div
        style={{
          padding: "16px 16px 14px",
          borderBottom: "1px solid #1B1B1F",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            ...DISPLAY,
            fontWeight: "700",
            fontSize: "26px",
            letterSpacing: "-.02em",
            lineHeight: "1",
          }}
        >
          Office settings
        </div>
        <div style={{ fontSize: "11.5px", color: "#ABA8A1", marginTop: "8px", lineHeight: "1.6" }}>
          The office itself. The people on each floor live in Team.
        </div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <LanguageCard />
        <Rule
          name="credentials"
          count={`${String(creds.filter((x) => x.status === "stored").length)}/${String(creds.length)}`}
        />
        <SettingsCreds />
        <Rule name="floors (projects)" count={String(floors.length)} />
        <div
          style={{
            borderRadius: "14px",
            background: "#101013",
            border: "1px solid #232328",
            overflow: "hidden",
          }}
        >
          {floors.map((floor, index) => (
            <SettingsFloor key={floor.name} floor={floor} index={index} first={index === 0} />
          ))}
        </div>
        <button
          type="button"
          onClick={addFloor}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "11px",
            borderRadius: "12px",
            border: "1px dashed rgba(255,197,49,.4)",
            background: "rgba(255,197,49,.07)",
            color: "#FFD666",
            fontSize: "12.5px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "all .22s",
          }}
          className="hopj"
        >
          + Add a project (floor)
        </button>
      </div>
    </div>
  );
}
