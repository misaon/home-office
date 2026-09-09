import {
  DoorKind,
  errorMessage,
  OBJECT_SPEC,
  ObjectKind,
  type OfficeLayout,
  RoomKind,
  WallMaterial,
} from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, CONTROL, Field, Section, Tabs } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import {
  type Draft,
  emptyDraft,
  erase,
  type Kinds,
  paint,
  rotate,
  slugify,
  type Tool,
} from "./draft.ts";
import { fromOffice, toOffice } from "./office-file.ts";
import { EditorCanvas } from "./canvas.tsx";
import { layoutsQuery, SavedOffices } from "./offices.tsx";

const TOOLS = [
  { value: "wall", label: "Wall" },
  { value: "room", label: "Room" },
  { value: "door", label: "Door" },
  { value: "object", label: "Furniture" },
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
  room: "Room",
  door: "Door",
  object: "Furniture",
};

/** Every choice of the active tool, two to a row, with a footprint where a piece has one. */
function Choices({
  options,
  value,
  size,
  pick,
}: {
  options: readonly string[];
  value: string;
  size: (option: string) => string | null;
  pick: (option: string) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((option) => {
        const footprint = size(option);
        return (
          <button
            key={option}
            type="button"
            className={`rounded-md border px-2 py-1.5 text-left text-2xs leading-tight break-words transition ${
              option === value
                ? "border-accent/70 bg-line text-white"
                : "border-line text-gray-400 hover:text-gray-100"
            }`}
            onClick={() => {
              pick(option);
            }}
          >
            {option}
            {footprint === null ? null : (
              <span className="mt-0.5 block font-mono text-gray-500">{footprint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const footprintOf = (option: string): string | null => {
  const parsed = ObjectKind.safeParse(option);
  if (!parsed.success) {
    return null;
  }
  const spec = OBJECT_SPEC[parsed.data];
  return `${String(spec.w)}×${String(spec.h)}${spec.onWall ? " wall" : ""}`;
};

/** The palette of the active tool, plus the footprint of what is in hand. */
function Palette({
  kinds,
  setKinds,
  tool,
}: {
  kinds: Kinds;
  setKinds: (kinds: Kinds) => void;
  tool: Tool;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const sideways = kinds.facing === "e" || kinds.facing === "w";
  const all =
    tool === "wall"
      ? WallMaterial.options
      : tool === "room"
        ? RoomKind.options
        : tool === "door"
          ? DoorKind.options
          : ObjectKind.options;
  const needle = search.trim().toLowerCase();
  const options = needle === "" ? all : all.filter((option) => option.includes(needle));
  const spec = OBJECT_SPEC[kinds.object];
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xs font-medium text-gray-400">{KIND_LABEL[tool]}</p>
        <span className="font-mono text-2xs text-gray-500">
          {options.length === all.length
            ? all.length
            : `${String(options.length)} of ${String(all.length)}`}
        </span>
      </div>
      <input
        aria-label={`Search ${KIND_LABEL[tool]}`}
        className={`${CONTROL} py-1.5 text-xs`}
        placeholder="search…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
      />
      {options.length === 0 ? (
        <p className="text-2xs text-gray-500">nothing matches “{search.trim()}”</p>
      ) : null}
      <Choices
        options={options}
        value={kinds[tool]}
        size={tool === "object" ? footprintOf : () => null}
        pick={(option) => {
          setKinds(
            tool === "wall"
              ? { ...kinds, wall: WallMaterial.parse(option) }
              : tool === "room"
                ? { ...kinds, room: RoomKind.parse(option) }
                : tool === "door"
                  ? { ...kinds, door: DoorKind.parse(option) }
                  : { ...kinds, object: ObjectKind.parse(option) },
          );
        }}
      />
      {tool === "object" || tool === "door" ? (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setKinds(rotate(kinds));
            }}
          >
            Rotate
          </Button>
          <span className="font-mono text-2xs text-gray-400">
            facing {kinds.facing}
            {tool === "door"
              ? ""
              : ` · ${String(sideways ? spec.h : spec.w)} × ${String(sideways ? spec.w : spec.h)} cells${spec.onWall ? " · on a wall" : ""}`}
          </span>
        </div>
      ) : null}
    </>
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
    object: "desk-developer",
    facing: "s",
  });
  const [note, setNote] = useState<string | null>(null);
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
          <h2 className="text-base font-semibold">Office editor</h2>
          <Button onClick={onClose}>Close</Button>
        </header>
        <OfficeFields draft={draft} setDraft={setDraft} />
        <Section title="Tool">
          <Tabs value={tool} options={TOOLS} onChange={setTool} />
          <Palette key={tool} kinds={kinds} setKinds={setKinds} tool={tool} />
          <p className="text-2xs leading-relaxed text-gray-500">
            {tool === "object" || tool === "door"
              ? "Click to place; the outline shows what it will take. The right button turns it a quarter, and a right drag erases."
              : "Drag with the left button to paint, with the right button to erase what this tool paints."}{" "}
            The middle button or shift pans; the wheel zooms.
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
