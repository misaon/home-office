import {
  DoorKind,
  errorMessage,
  OBJECT_SIZE,
  ObjectKind,
  type OfficeLayout,
  RoomKind,
  WallMaterial,
} from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, CONTROL, Field, Section, Segmented } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import {
  type Draft,
  emptyDraft,
  erase,
  fromOffice,
  type Kinds,
  paint,
  slugify,
  toOffice,
  type Tool,
} from "./draft.ts";
import { EditorCanvas } from "./canvas.tsx";

const TOOLS = [
  { value: "wall", label: "Wall" },
  { value: "room", label: "Room" },
  { value: "door", label: "Door" },
  { value: "object", label: "Furniture" },
] as const satisfies readonly { value: Tool; label: string }[];

const SIZE = { width: 60, height: 34 };
const layoutsQuery = {
  queryKey: ["layouts"],
  queryFn: () => requireClient().layouts.list(),
} as const;

/** The office's own fields. The file name is the name, slugified, so it cannot drift from it. */
function OfficeFields({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
}): React.JSX.Element {
  const office = toOffice(draft);
  return (
    <Section title="Office">
      <Field id="ho-editor-name" label="Name">
        <input
          id="ho-editor-name"
          className={CONTROL}
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value, id: slugify(e.target.value) });
          }}
        />
      </Field>
      <Field id="ho-editor-id" label="File" hint="taken from the name">
        <input
          id="ho-editor-id"
          className={`${CONTROL} font-mono text-gray-400`}
          readOnly
          value={`layouts/${draft.id}.json`}
        />
      </Field>
      <p className="text-2xs text-gray-500">
        {draft.width} × {draft.height} cells · {office.walls.length} wall runs ·{" "}
        {office.rooms.length} room runs · {draft.doors.length} doors · {draft.objects.length}{" "}
        furniture
      </p>
    </Section>
  );
}

const KIND_LABEL: Record<Tool, string> = {
  wall: "Material",
  room: "Room type",
  door: "Door",
  object: "Furniture",
};

/** The palette of the active tool, plus the footprint furniture will take. */
function Palette({
  kinds,
  setKinds,
  tool,
}: {
  kinds: Kinds;
  setKinds: (kinds: Kinds) => void;
  tool: Tool;
}): React.JSX.Element {
  const options =
    tool === "wall"
      ? WallMaterial.options
      : tool === "room"
        ? RoomKind.options
        : tool === "door"
          ? DoorKind.options
          : ObjectKind.options;
  const size = OBJECT_SIZE[kinds.object];
  return (
    <>
      <Field id="ho-editor-kind" label={KIND_LABEL[tool]}>
        <select
          id="ho-editor-kind"
          className={CONTROL}
          value={kinds[tool]}
          onChange={(e) => {
            const next = e.target.value;
            setKinds(
              tool === "wall"
                ? { ...kinds, wall: WallMaterial.parse(next) }
                : tool === "room"
                  ? { ...kinds, room: RoomKind.parse(next) }
                  : tool === "door"
                    ? { ...kinds, door: DoorKind.parse(next) }
                    : { ...kinds, object: ObjectKind.parse(next) },
            );
          }}
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </Field>
      {tool === "object" ? (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setKinds({ ...kinds, rotated: !kinds.rotated });
            }}
          >
            Rotate
          </Button>
          <span className="font-mono text-2xs text-gray-400">
            {kinds.rotated ? size.h : size.w} × {kinds.rotated ? size.w : size.h} cells
          </span>
        </div>
      ) : null}
    </>
  );
}

function SavedOffices({
  load,
  save,
}: {
  load: (office: OfficeLayout) => void;
  save: () => void;
}): React.JSX.Element {
  const connection = useUi((s) => s.connection);
  const store = useQuery({ ...layoutsQuery, enabled: connection === "online" });
  const available = store.data?.available ?? false;
  return (
    <Section title="Saved offices">
      {available ? null : (
        <p className="text-2xs text-amber-300">
          This build has no repository to write into, so saving is unavailable.
        </p>
      )}
      <div className="space-y-1">
        {(store.data?.layouts ?? []).map((office) => (
          <button
            key={office.id}
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left hover:bg-line"
            onClick={() => {
              load(office);
            }}
          >
            {office.name}{" "}
            <span className="font-mono text-2xs text-gray-500">
              {office.id} · {office.width}×{office.height}
            </span>
          </button>
        ))}
      </div>
      <Button variant="primary" disabled={!available} onClick={save}>
        Save office
      </Button>
    </Section>
  );
}

/**
 * The internal office editor. Compiled into development bundles only — `ui-build.ts` resolves this
 * module to a stub for production. Left button paints, right button erases, and Save writes
 * `layouts/<id>.json` in the repository through the daemon.
 */
export function EditorOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queries = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft("New office", SIZE.width, SIZE.height),
  );
  const [tool, setTool] = useState<Tool>("wall");
  const [kinds, setKinds] = useState<Kinds>({
    wall: "wall",
    room: "team-room",
    door: "door",
    object: "desk",
    rotated: false,
  });
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (office: OfficeLayout) => requireClient().layouts.save(office),
    onSuccess: () => queries.invalidateQueries({ queryKey: layoutsQuery.queryKey }),
  });
  return (
    <div className="absolute inset-0 z-40 flex bg-ink">
      <aside className="flex w-[320px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line p-5 text-xs">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Office editor</h2>
          <Button onClick={onClose}>Close</Button>
        </header>
        <OfficeFields draft={draft} setDraft={setDraft} />
        <Section title="Tool">
          <Segmented value={tool} options={TOOLS} onChange={setTool} />
          <Palette kinds={kinds} setKinds={setKinds} tool={tool} />
          <p className="text-2xs leading-relaxed text-gray-500">
            Drag with the left button to paint, with the right button to erase. The middle button or
            shift pans; the wheel zooms.
          </p>
          {note === null ? null : <p className="text-2xs text-amber-300">{note}</p>}
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
          <p className="font-mono text-2xs text-emerald-300">saved {save.data.path}</p>
        )}
      </aside>
      <div className="min-w-0 flex-1 bg-white">
        <EditorCanvas
          draft={draft}
          onPaint={(rect, erasing) => {
            const result = erasing ? erase(draft, rect) : paint(draft, tool, rect, kinds);
            setDraft(result.next);
            setNote(result.note);
          }}
        />
      </div>
    </div>
  );
}
