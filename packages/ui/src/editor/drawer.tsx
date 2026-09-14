import { errorMessage, type OfficeLayout } from "@ho/protocol";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Caption, FIELD } from "../design/controls.tsx";
import { Section } from "../design/section.tsx";
import { Segmented } from "../design/segmented.tsx";
import { useKindName } from "../i18n/kinds.ts";
import { slugify, type Brush, type Note, type OfficeDraft, type Tool } from "./draft.ts";
import { fromOffice, toOffice } from "./office-file.ts";
import { SavedOffices } from "./offices.tsx";
import { Palette } from "./palette.tsx";

const DRAWER: React.CSSProperties = {
  width: "360px",
  flex: "0 0 360px",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  overflowY: "auto",
  borderRight: "1px solid #26262C",
  background: "#0C0C0E",
  padding: "20px",
  animation: "drawerIn .42s cubic-bezier(.2,.9,.3,1) both",
};

const TOOLS = [
  { value: "wall", label: "editor.wall" },
  { value: "room", label: "editor.room" },
  { value: "door", label: "editor.door" },
  { value: "object", label: "editor.furniture" },
] as const satisfies readonly { value: Tool; label: string }[];

const HINT: React.CSSProperties = { fontSize: "11.5px", lineHeight: "1.7", color: "#A6A39C" };

/** The office's own fields. The file name is the name, slugified, so it cannot drift from it. */
function OfficeFields({
  draft,
  setDraft,
}: {
  draft: OfficeDraft;
  setDraft: (draft: OfficeDraft) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const office = toOffice(draft);
  return (
    <Section title={t("editor.office")}>
      <div>
        <Caption>{t("editor.name")}</Caption>
        <input
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value, id: slugify(e.target.value) });
          }}
          style={FIELD}
        />
      </div>
      <div>
        <Caption>{t("editor.file")}</Caption>
        <input
          readOnly
          value={`layouts/${draft.id}.json`}
          style={{ ...FIELD, fontFamily: "'JetBrains Mono',monospace", color: "#A6A39C" }}
        />
        <div style={{ fontSize: "11px", color: "#A6A39C", marginTop: "6px" }}>
          {t("editor.fileHint")}
        </div>
      </div>
      <p style={HINT}>
        {t("editor.stats", {
          width: draft.width,
          height: draft.height,
          walls: office.walls.length,
          rooms: office.rooms.length,
          doors: draft.doors.length,
          objects: draft.objects.length,
        })}
      </p>
    </Section>
  );
}

/** Everything the editor is driven by, in the drawer the design drew for it. */
export function EditorDrawer({
  draft,
  setDraft,
  tool,
  setTool,
  brush,
  setBrush,
  note,
  setNote,
  save,
  onClose,
}: {
  draft: OfficeDraft;
  setDraft: (draft: OfficeDraft) => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
  brush: Brush;
  setBrush: (brush: Brush) => void;
  note: Note | null;
  setNote: (note: Note | null) => void;
  save: UseMutationResult<{ path: string }, Error, OfficeLayout>;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const kindName = useKindName();
  return (
    <aside style={DRAWER}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "4px",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: "600",
              fontSize: "15px",
            }}
          >
            {t("editor.title")}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "9.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#FFD666",
              marginTop: "3px",
            }}
          >
            {t("editor.internalOnly")}
          </div>
        </div>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </header>
      <OfficeFields draft={draft} setDraft={setDraft} />
      <Section title={t("editor.tool")}>
        <Segmented
          value={tool}
          options={TOOLS.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={setTool}
        />
        <Palette key={tool} brush={brush} setBrush={setBrush} tool={tool} />
        <p style={HINT}>
          {tool === "object" || tool === "door" ? t("editor.helpPlace") : t("editor.helpPaint")}{" "}
          {t("editor.helpPan")}
        </p>
        {note === null ? null : (
          <p style={{ fontSize: "11.5px", color: "#F2994A" }}>
            {t(note.key, { name: note.name === undefined ? "" : kindName("object", note.name) })}
          </p>
        )}
      </Section>
      <SavedOffices
        load={(office) => {
          setDraft(fromOffice(office));
          setNote(null);
        }}
        save={() => {
          save.mutate(toOffice(draft));
        }}
      />
      {save.error === null ? null : (
        <p style={{ fontSize: "11.5px", color: "#FFB3B3" }}>{errorMessage(save.error)}</p>
      )}
      {save.data === undefined ? null : (
        <p
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11.5px", color: "#8FE8C4" }}
        >
          {t("editor.savedAs", { path: save.data.path })}
        </p>
      )}
    </aside>
  );
}
