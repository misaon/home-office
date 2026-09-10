import { errorMessage, type OfficeLayout } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useKindName } from "../i18n/kinds.ts";
import { Button, CONTROL, Field, Section, Tabs } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import {
  type Draft,
  emptyDraft,
  erase,
  type Kinds,
  paint,
  type Note,
  rotate,
  slugify,
  type Tool,
} from "./draft.ts";
import { fromOffice, toOffice } from "./office-file.ts";
import { EditorCanvas } from "./canvas.tsx";
import { Palette } from "./palette.tsx";
import { layoutsQuery, SavedOffices } from "./offices.tsx";

const TOOLS = [
  { value: "wall", label: "editor.wall" },
  { value: "room", label: "editor.room" },
  { value: "door", label: "editor.door" },
  { value: "object", label: "editor.furniture" },
] as const satisfies readonly { value: Tool; label: string }[];

const SIZE = { width: 60, height: 34 };
/** The office's own fields. The file name is the name, slugified, so it cannot drift from it. */
function OfficeFields({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const office = toOffice(draft);
  return (
    <Section title={t("editor.office")}>
      <Field id="ho-editor-name" label={t("editor.name")}>
        <input
          id="ho-editor-name"
          className={CONTROL}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value, id: slugify(e.target.value) });
          }}
        />
      </Field>
      <Field id="ho-editor-id" label={t("editor.file")} hint={t("editor.fileHint")}>
        <input
          id="ho-editor-id"
          className={`${CONTROL} font-mono text-gray-400`}
          readOnly
          value={`layouts/${draft.id}.json`}
        />
      </Field>
      <p className="text-2xs text-gray-500">
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

/**
 * The internal office editor. Compiled into development bundles only — `ui-build.ts` resolves this
 * module to a stub for production. Left button paints, right button erases, and Save writes
 * `layouts/<id>.json` in the repository through the daemon.
 */
export function EditorOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const kindName = useKindName();
  const queries = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(t("editor.newOffice"), SIZE.width, SIZE.height),
  );
  const [tool, setTool] = useState<Tool>("wall");
  const [kinds, setKinds] = useState<Kinds>({
    wall: "wall",
    room: "team-room",
    door: "door",
    object: "desk-developer",
    facing: "s",
  });
  const [note, setNote] = useState<Note | null>(null);
  // R rotates the piece being held, the way Prison Architect does, unless a field has the keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "r" && document.activeElement?.tagName !== "INPUT") {
        setKinds(rotate);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const save = useMutation({
    mutationFn: (office: OfficeLayout) => requireClient().layouts.save(office),
    onSuccess: () => queries.invalidateQueries({ queryKey: layoutsQuery.queryKey }),
  });
  return (
    <div className="absolute inset-0 z-40 flex bg-ink">
      <aside className="flex w-[360px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line p-5 text-xs">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("editor.title")}</h2>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </header>
        <OfficeFields draft={draft} setDraft={setDraft} />
        <Section title={t("editor.tool")}>
          <Tabs
            value={tool}
            options={TOOLS.map(({ value, label }) => ({ value, label: t(label) }))}
            onChange={setTool}
          />
          <Palette key={tool} kinds={kinds} setKinds={setKinds} tool={tool} />
          <p className="text-2xs leading-relaxed text-gray-500">
            {tool === "object" || tool === "door" ? t("editor.helpPlace") : t("editor.helpPaint")}{" "}
            {t("editor.helpPan")}
          </p>
          {note === null ? null : (
            <p className="text-2xs text-amber-300">
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
          <p className="text-2xs text-red-300">{errorMessage(save.error)}</p>
        )}
        {save.data === undefined ? null : (
          <p className="font-mono text-2xs text-emerald-300">
            {t("editor.savedAs", { path: save.data.path })}
          </p>
        )}
      </aside>
      <div className="min-w-0 flex-1 bg-white">
        <EditorCanvas
          draft={draft}
          tool={tool}
          kinds={kinds}
          onRotate={() => {
            setKinds(rotate);
          }}
          onPaint={(rect, erasing) => {
            const result = erasing ? erase(draft, tool, rect) : paint(draft, tool, rect, kinds);
            setDraft(result.next);
            setNote(result.note);
          }}
        />
      </div>
    </div>
  );
}
