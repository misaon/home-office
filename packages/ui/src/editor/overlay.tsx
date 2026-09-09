import { DoorKind, errorMessage, type OfficeLayout, RoomKind, WallMaterial } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button, CONTROL, Field, Section, Segmented } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { type Draft, emptyDraft, fromOffice, paint, toOffice, type Tool } from "./draft.ts";
import { EditorScene } from "./scene.ts";

const TOOLS = [
  { value: "wall", label: "Wall" },
  { value: "room", label: "Room" },
  { value: "door", label: "Door" },
  { value: "erase", label: "Erase" },
] as const satisfies readonly { value: Tool; label: string }[];

const OFFICE_DEFAULT = { width: 60, height: 34 };
const layoutsQuery = {
  queryKey: ["layouts"],
  queryFn: () => requireClient().layouts.list(),
} as const;

/** The Pixi canvas, wired to the draft: it redraws on every edit and reports what a drag painted. */
function Canvas({
  draft,
  tool,
  onPaint,
  onHover,
}: {
  draft: Draft;
  tool: Tool;
  onPaint: (rect: { x: number; y: number; w: number; h: number }) => void;
  onHover: (cell: { x: number; y: number } | null) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EditorScene | null>(null);
  // The scene is built once; the draft reaches it through a ref so mounting does not depend on it.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
    scene.current?.setDraft(draft);
  }, [draft]);
  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const created = new EditorScene();
    let disposed = false;
    void created.init(element).then(() => {
      if (disposed) {
        created.destroy();
        return;
      }
      scene.current = created;
      created.setDraft(latest.current);
    });
    return () => {
      disposed = true;
      scene.current = null;
      created.destroy();
    };
  }, []);
  useEffect(() => {
    scene.current?.setTool(tool);
  }, [tool]);
  useEffect(() => {
    if (scene.current !== null) {
      scene.current.onPaint = onPaint;
      scene.current.onHover = onHover;
    }
  }, [onPaint, onHover]);
  return <div ref={host} className="h-full w-full" />;
}

type Kinds = { wall: WallMaterial; room: RoomKind; door: DoorKind };

function Palette({
  kinds,
  setKinds,
  tool,
}: {
  kinds: Kinds;
  setKinds: (kinds: Kinds) => void;
  tool: Tool;
}): React.JSX.Element | null {
  if (tool === "erase") {
    return <p className="text-2xs text-gray-500">Drag to clear walls, rooms and doors.</p>;
  }
  const options =
    tool === "wall" ? WallMaterial.options : tool === "room" ? RoomKind.options : DoorKind.options;
  const value = kinds[tool];
  return (
    <Field id="ho-editor-kind" label={tool === "room" ? "Room type" : "Material"}>
      <select
        id="ho-editor-kind"
        className={CONTROL}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setKinds(
            tool === "wall"
              ? { ...kinds, wall: WallMaterial.parse(next) }
              : tool === "room"
                ? { ...kinds, room: RoomKind.parse(next) }
                : { ...kinds, door: DoorKind.parse(next) },
          );
        }}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The internal office editor. Compiled into development bundles only: `process.env.NODE_ENV` is replaced
 * at build time, so the production bundle cannot contain it. Draw walls, rooms and doors on the grid and
 * Save writes `layouts/<id>.json` in the repository through the daemon.
 */
export function EditorOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queries = useQueryClient();
  // The editor can open before the socket is up; asking then would only fail.
  const connection = useUi((s) => s.connection);
  const store = useQuery({ ...layoutsQuery, enabled: connection === "online" });
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft("new-office", "New office", OFFICE_DEFAULT.width, OFFICE_DEFAULT.height),
  );
  const [tool, setTool] = useState<Tool>("wall");
  const [kinds, setKinds] = useState<Kinds>({ wall: "wall", room: "team-room", door: "door" });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const save = useMutation({
    mutationFn: (office: OfficeLayout) => requireClient().layouts.save(office),
    onSuccess: () => queries.invalidateQueries({ queryKey: layoutsQuery.queryKey }),
  });
  const available = store.data?.available ?? false;
  const counts = toOffice(draft);
  return (
    <div className="absolute inset-0 z-40 flex bg-ink">
      <aside className="flex w-[320px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line p-5 text-xs">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Office editor</h2>
          <Button onClick={onClose}>Close</Button>
        </header>
        <Section title="Office">
          <Field id="ho-editor-id" label="Id (file name)">
            <input
              id="ho-editor-id"
              className={`${CONTROL} font-mono`}
              value={draft.id}
              onChange={(e) => {
                setDraft({ ...draft, id: e.target.value });
              }}
            />
          </Field>
          <Field id="ho-editor-name" label="Name">
            <input
              id="ho-editor-name"
              className={CONTROL}
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
              }}
            />
          </Field>
          <p className="text-2xs text-gray-500">
            {draft.width} × {draft.height} cells · {counts.walls.length} wall runs ·{" "}
            {counts.rooms.length} room runs · {counts.doors.length} doors
          </p>
        </Section>
        <Section title="Tool">
          <Segmented value={tool} options={TOOLS} onChange={setTool} />
          <Palette kinds={kinds} setKinds={setKinds} tool={tool} />
          <p className="text-2xs text-gray-500">
            Drag to paint. Shift-drag, the middle or the right button pans; the wheel zooms.
            {hover === null ? "" : ` Cell ${String(hover.x)}, ${String(hover.y)}.`}
          </p>
        </Section>
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
                  setDraft(fromOffice(office));
                }}
              >
                {office.name}{" "}
                <span className="font-mono text-2xs text-gray-500">
                  {office.id} · {office.width}×{office.height}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={!available || save.isPending}
            onClick={() => {
              save.mutate(toOffice(draft));
            }}
          >
            {save.isPending ? "Saving…" : "Save office"}
          </Button>
          {save.error === null ? null : (
            <p className="text-2xs text-red-300">{errorMessage(save.error)}</p>
          )}
          {save.data === undefined ? null : (
            <p className="font-mono text-2xs text-emerald-300">saved {save.data.path}</p>
          )}
        </Section>
      </aside>
      <div className="min-w-0 flex-1 bg-white">
        <Canvas
          draft={draft}
          tool={tool}
          onPaint={(rect) => {
            setDraft((current) => paint(current, tool, rect, kinds));
          }}
          onHover={setHover}
        />
      </div>
    </div>
  );
}
