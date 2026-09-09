import { type DoorKind, type OfficeLayout, type RoomKind, type WallMaterial } from "@ho/protocol";
import { type Layout, layoutFromOffice } from "@ho/sim";

/** What the editor paints with. Rectangles are for dragging; a door is one cell. */
export type Tool = "wall" | "room" | "door" | "erase";

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * While drawing, the office is kept per cell: erasing a corner out of a rectangle is then a single
 * assignment instead of a geometry problem. `toOffice` compresses the cells back into the rectangles the
 * JSON stores.
 */
export type Draft = {
  id: string;
  name: string;
  width: number;
  height: number;
  wall: (WallMaterial | null)[];
  room: (RoomKind | null)[];
  door: (DoorKind | null)[];
};

const cells = <T>(count: number): (T | null)[] => Array.from({ length: count }, () => null);

export const emptyDraft = (id: string, name: string, width: number, height: number): Draft => ({
  id,
  name,
  width,
  height,
  wall: cells(width * height),
  room: cells(width * height),
  door: cells(width * height),
});

const indices = (draft: Draft, rect: Rect): number[] => {
  const out: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x >= 0 && y >= 0 && x < draft.width && y < draft.height) {
        out.push(y * draft.width + x);
      }
    }
  }
  return out;
};

/** Paints a rectangle with the active tool. A door only goes where a wall already stands. */
export function paint(
  draft: Draft,
  tool: Tool,
  rect: Rect,
  kinds: { wall: WallMaterial; room: RoomKind; door: DoorKind },
): Draft {
  const next: Draft = {
    ...draft,
    wall: [...draft.wall],
    room: [...draft.room],
    door: [...draft.door],
  };
  for (const i of indices(draft, rect)) {
    if (tool === "wall") {
      next.wall[i] = kinds.wall;
    } else if (tool === "room") {
      next.room[i] = kinds.room;
    } else if (tool === "door") {
      if (next.wall[i] !== null) {
        next.door[i] = kinds.door;
      }
    } else {
      next.wall[i] = null;
      next.room[i] = null;
      next.door[i] = null;
    }
  }
  return next;
}

/** Runs of the same value in one row become one rectangle; a wall drawn as a line stays one line. */
function* runs<T>(
  values: readonly (T | null)[],
  width: number,
  height: number,
): Generator<{ value: T; rect: Rect }> {
  for (let y = 0; y < height; y += 1) {
    let start = 0;
    let current: T | null = null;
    for (let x = 0; x <= width; x += 1) {
      const value = x === width ? null : (values[y * width + x] ?? null);
      if (value !== current) {
        if (current !== null) {
          yield { value: current, rect: { x: start, y, w: x - start, h: 1 } };
        }
        current = value;
        start = x;
      }
    }
  }
}

/** The draft as the JSON that gets saved. */
export const toOffice = (draft: Draft): OfficeLayout => ({
  id: draft.id,
  name: draft.name,
  width: draft.width,
  height: draft.height,
  walls: [...runs(draft.wall, draft.width, draft.height)].map(({ value, rect }) => ({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    material: value,
  })),
  rooms: [...runs(draft.room, draft.width, draft.height)].map(({ value, rect }) => ({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    room: value,
  })),
  doors: draft.door.flatMap((kind, i) =>
    kind === null ? [] : [{ x: i % draft.width, y: Math.floor(i / draft.width), kind }],
  ),
});

/** A saved office back into cells, so it can be edited again. */
export function fromOffice(office: OfficeLayout): Draft {
  const draft = emptyDraft(office.id, office.name, office.width, office.height);
  for (const rect of office.walls) {
    for (const i of indices(draft, rect)) {
      draft.wall[i] = rect.material;
    }
  }
  for (const rect of office.rooms) {
    for (const i of indices(draft, rect)) {
      draft.room[i] = rect.room;
    }
  }
  for (const door of office.doors) {
    draft.door[door.y * draft.width + door.x] = door.kind;
  }
  return draft;
}

/** What the office renderer draws: the draft compiled exactly like a saved office would be. */
export const draftLayout = (draft: Draft): Layout => layoutFromOffice(toOffice(draft));
