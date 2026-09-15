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

const DRAWER =
  "w-360 flex-[0_0_360px] flex flex-col gap-20 overflow-y-auto border-r border-border bg-sunk p-20 animate-drawer";

const TOOLS = [
  { value: "wall", label: "editor.wall" },
  { value: "room", label: "editor.room" },
  { value: "door", label: "editor.door" },
  { value: "object", label: "editor.furniture" },
] as const satisfies readonly { value: Tool; label: string }[];

const HINT = "text-11h leading-loose text-ink-meta my-11h";

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
          className={FIELD}
        />
      </div>
      <div>
        <Caption>{t("editor.file")}</Caption>
        <input
          readOnly
          value={`layouts/${draft.id}.json`}
          className={`${FIELD} font-mono text-ink-meta`}
        />
        <div className="text-11 text-ink-meta mt-6">{t("editor.fileHint")}</div>
      </div>
      <p className={HINT}>
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
    <aside className={DRAWER}>
      <header className="flex items-center justify-between gap-10 mb-4">
        <div>
          <div className="font-display font-semibold text-15">{t("editor.title")}</div>
          <div className="font-mono text-9h tracking-caps uppercase text-accent-soft mt-3">
            {t("editor.internalOnly")}
          </div>
        </div>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </header>
      <OfficeFields draft={draft} setDraft={setDraft} />
      <Section title={t("editor.tool")}>
        <Segmented
          label={t("editor.tool")}
          value={tool}
          options={TOOLS.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={setTool}
        />
        <Palette key={tool} brush={brush} setBrush={setBrush} tool={tool} />
        <p className={HINT}>
          {tool === "object" || tool === "door" ? t("editor.helpPlace") : t("editor.helpPaint")}{" "}
          {t("editor.helpPan")}
        </p>
        {note === null ? null : (
          <p className="text-11h text-warn">
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
        <p className="text-11h text-bad-soft">{errorMessage(save.error)}</p>
      )}
      {save.data === undefined ? null : (
        <p className="font-mono text-11h text-good-soft">
          {t("editor.savedAs", { path: save.data.path })}
        </p>
      )}
    </aside>
  );
}
