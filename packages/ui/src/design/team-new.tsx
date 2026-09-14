import { SelectField } from "./select-field.tsx";
import { CAPTION } from "./tokens.ts";
import { useDesign, useFloor, type NewAgent } from "./store.ts";

const FIELDS: [keyof NewAgent, readonly string[]][] = [
  ["role", ["worker", "boss"]],
  ["gender", ["neutral", "female", "male"]],
  ["provider", ["Claude Code", "OpenCode", "Codex", "Gemini CLI"]],
  ["signin", ["subscription", "api key"]],
  ["model", ["Sonnet (latest)", "Opus (latest)", "Haiku"]],
  ["effort", ["high", "medium", "low"]],
];

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
};

/** Hiring someone onto the floor: a name, six choices and a prompt they will live by. */
export function TeamNew(): React.JSX.Element {
  const floor = useFloor();
  const newName = useDesign((s) => s.newName);
  const newAgent = useDesign((s) => s.newAgent);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const patchCur = useDesign((s) => s.patchCur);
  const flash = useDesign((s) => s.flash);

  return (
    <div
      style={{
        padding: "15px",
        borderRadius: "14px",
        background: "#0F0F12",
        border: "1px solid #26262C",
        animation: "popIn .4s cubic-bezier(.2,.9,.3,1.05) both",
      }}
    >
      <div style={{ ...CAPTION, marginBottom: "7px" }}>name</div>
      <input
        value={newName}
        onChange={(e) => {
          set({ newName: e.target.value });
        }}
        placeholder="e.g. Nora"
        style={{ ...INPUT, fontSize: "13px", marginBottom: "13px" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px" }}>
        {FIELDS.map(([name, options]) => (
          <SelectField
            key={name}
            scope="new"
            name={name}
            options={options}
            value={newAgent[name]}
            onPick={(next) => {
              update((s) => ({ newAgent: { ...s.newAgent, [name]: next } }));
            }}
          />
        ))}
      </div>
      <div style={{ ...CAPTION, margin: "13px 0 7px" }}>base prompt</div>
      <textarea
        rows={3}
        placeholder="Persona, habits, constraints…"
        style={{ ...INPUT, fontSize: "12.5px", resize: "none", lineHeight: "1.5" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "13px" }}>
        <button
          type="button"
          onClick={() => {
            const name = newName.trim() === "" ? "Nora" : newName.trim();
            patchCur({
              team: floor.team.concat({
                i: name.charAt(0).toUpperCase(),
                name,
                status: "idle",
                doing: "Waiting for work",
                since: "just hired",
                prompt: "",
                ...newAgent,
                role: newAgent.role === "boss" ? "boss" : "worker",
                model: newAgent.model.replace(" (latest)", ""),
              }),
            });
            set({ addAgent: false, newName: "" });
            flash(`${name} joined ${floor.name}`);
          }}
          style={{
            padding: "9px 16px",
            borderRadius: "10px",
            border: "0",
            background: "var(--a,#FFC531)",
            color: "#150F02",
            fontSize: "12.5px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all .22s",
          }}
          className="hopm"
        >
          Add agent
        </button>
      </div>
    </div>
  );
}
