import { pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

const LANGS = ["English", "Čeština"] as const;

/** Which language the office speaks to you in; the agents are briefed in English regardless. */
export function LanguageCard(): React.JSX.Element {
  const lang = useDesign((s) => s.lang);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  return (
    <div
      style={{
        borderRadius: "14px",
        background: "#101013",
        border: "1px solid #232328",
        overflow: "hidden",
        marginBottom: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "11px",
          padding: "13px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1", minWidth: "120px" }}>
          <div style={{ fontSize: "13px" }}>Language</div>
          <div style={{ fontSize: "11px", color: "#A6A39C", marginTop: "4px", lineHeight: "1.5" }}>
            Agents are always briefed in English.
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", flex: "0 0 auto" }}>
          {LANGS.map((name) => {
            const tone = pill(lang === name);
            return (
              <button
                type="button"
                key={name}
                onClick={() => {
                  set({ lang: name });
                  flash(
                    name === "English" ? "Office language: English" : "Jazyk kanceláře: čeština",
                  );
                }}
                style={{
                  padding: "6px 13px",
                  borderRadius: "99px",
                  cursor: "pointer",
                  fontSize: "12px",
                  transition: "all .22s",
                  border: `1px solid ${tone.bd}`,
                  background: tone.bg,
                  color: tone.fg,
                }}
                className="hop4"
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
