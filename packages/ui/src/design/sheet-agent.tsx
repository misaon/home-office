import { CAPS, FIELD, PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { AgentStatus } from "./sheet-agent-status.tsx";
import { SelectField } from "./select-field.tsx";
import { useDesign, useFloor } from "./store.ts";
import type { Member } from "./data.ts";

const FIELDS: [keyof Member, readonly string[]][] = [
  ["role", ["worker", "boss"]],
  ["provider", ["Claude Code", "OpenCode", "Codex", "Gemini CLI"]],
  ["model", ["Opus", "Sonnet", "Haiku"]],
  ["effort", ["low", "medium", "high"]],
];

/** One colleague, opened up: what they are doing now, and everything you can change about them. */
export function AgentSheet({ draft, index }: { draft: Member; index: number }): React.JSX.Element {
  const floor = useFloor();
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const patchCur = useDesign((s) => s.patchCur);
  const flash = useDesign((s) => s.flash);

  return (
    <SheetShell
      title={draft.name}
      subtitle={`${draft.provider} · ${draft.model} / ${draft.effort}`}
    >
      <AgentStatus draft={draft} />
      <div style={{ ...CAPS, marginBottom: "7px" }}>name</div>
      <input
        value={draft.name}
        onChange={(e) => {
          const name = e.target.value;
          update((s) => ({ sheetDraft: s.sheetDraft === null ? null : { ...s.sheetDraft, name } }));
        }}
        style={{ ...FIELD, fontSize: "13px", marginBottom: "14px" }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "11px",
          marginBottom: "14px",
        }}
      >
        {FIELDS.map(([name, options]) => (
          <SelectField
            key={name}
            scope="sheet"
            name={name}
            options={options}
            value={String(draft[name])}
            onPick={(next) => {
              update((s) => ({
                sheetDraft: s.sheetDraft === null ? null : { ...s.sheetDraft, [name]: next },
              }));
            }}
          />
        ))}
      </div>
      <div style={{ ...CAPS, marginBottom: "7px" }}>base prompt</div>
      <textarea
        rows={5}
        value={draft.prompt}
        onChange={(e) => {
          const prompt = e.target.value;
          update((s) => ({
            sheetDraft: s.sheetDraft === null ? null : { ...s.sheetDraft, prompt },
          }));
        }}
        style={{
          ...FIELD,
          padding: "11px 12px",
          fontSize: "12.5px",
          resize: "none",
          lineHeight: "1.55",
          marginBottom: "16px",
        }}
      />
      <div style={{ display: "flex", gap: "9px" }}>
        <button
          type="button"
          onClick={() => {
            patchCur({ team: floor.team.map((p, n) => (n === index ? { ...draft } : p)) });
            set({ sheet: null, sheetDraft: null });
            flash("Agent updated");
          }}
          style={PRIMARY}
          className="hopm"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={() => {
            patchCur({ team: floor.team.filter((_, n) => n !== index) });
            set({ sheet: null, sheetDraft: null });
            flash("Agent removed from the floor");
          }}
          style={{
            padding: "11px 15px",
            borderRadius: "11px",
            border: "1px solid rgba(255,122,122,.3)",
            background: "rgba(255,122,122,.1)",
            color: "#FFB3B3",
            fontSize: "12.5px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all .2s",
          }}
          className="hopp"
        >
          Remove
        </button>
      </div>
    </SheetShell>
  );
}
