import {
  DOOR_SPAN,
  type DoorKind,
  OBJECT_SIZE,
  type ObjectKind,
  type OfficeLayout,
  type RoomKind,
  type WallMaterial,
} from "@ho/protocol";
import { type Layout, layoutFromOffice } from "@ho/sim";

/** What the editor paints with. Erasing is the right button, not a tool of its own. */
export type Tool = "wall" | "room" | "door" | "object";

export type Rect = { x: number; y: number; w: number; h: number };

/** What the palette is set to; the object's footprint comes from its kind, swapped when rotated. */
export type Kinds = {
  wall: WallMaterial;
  room: RoomKind;
  door: DoorKind;
  object: ObjectKind;
  rotated: boolean;
};

/**
 * While drawing, walls and rooms are kept per cell — erasing a corner out of a rectangle is then a
 * single assignment. Doors and furniture stay as placed rectangles, because their footprint carries a
 * direction that per-cell painting would lose.
 */
export type Draft = {
  id: string;
  name: string;
  width: number;
  height: number;
  wall: (WallMaterial | null)[];
  room: (RoomKind | null)[];
  doors: (Rect & { kind: DoorKind })[];
  objects: (Rect & { kind: ObjectKind })[];
};

const cells = <T>(count: number): (T | null)[] => Array.from({ length: count }, () => null);

/** The office's name becomes the file's name: lowercase, dashes, nothing else. */
export const slugify = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replaceAll(/-+$/gu, "");
  return slug === "" ? "office" : slug;
};

export const emptyDraft = (name: string, width: number, height: number): Draft => ({
  id: slugify(name),
  name,
  width,
  height,
  wall: cells(width * height),
  room: cells(width * height),
  doors: [],
  objects: [],
});

const inside = (draft: Draft, rect: Rect): boolean =>
  rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= draft.width && rect.y + rect.h <= draft.height;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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

const isWall = (draft: Draft, x: number, y: number): boolean =>
  x >= 0 &&
  y >= 0 &&
  x < draft.width &&
  y < draft.height &&
  draft.wall[y * draft.width + x] !== null;

const copy = (draft: Draft): Draft => ({
  ...draft,
  wall: [...draft.wall],
  room: [...draft.room],
  doors: [...draft.doors],
  objects: [...draft.objects],
});

/** A doorway follows the wall it is cut into: along the run if there is one, downwards otherwise. */
const doorRect = (draft: Draft, at: Rect): Rect => {
  const horizontal = isWall(draft, at.x - 1, at.y) || isWall(draft, at.x + 1, at.y);
  return horizontal
    ? { x: at.x, y: at.y, w: DOOR_SPAN, h: 1 }
    : { x: at.x, y: at.y, w: 1, h: DOOR_SPAN };
};

const footprint = (draft: Draft, at: Rect, kinds: Kinds): Rect => {
  const size = OBJECT_SIZE[kinds.object];
  return {
    x: at.x,
    y: at.y,
    w: kinds.rotated ? size.h : size.w,
    h: kinds.rotated ? size.w : size.h,
  };
};

export type Painted = { next: Draft; note: string | null };

/** Paints with the active tool. Doors need wall to cut through; furniture needs the room to be free. */
export function paint(draft: Draft, tool: Tool, rect: Rect, kinds: Kinds): Painted {
  const next = copy(draft);
  if (tool === "wall" || tool === "room") {
    for (const i of indices(draft, rect)) {
      if (tool === "wall") {
        next.wall[i] = kinds.wall;
      } else {
        next.room[i] = kinds.room;
      }
    }
    return { next, note: null };
  }
  const box = tool === "door" ? doorRect(draft, rect) : footprint(draft, rect, kinds);
  if (!inside(draft, box)) {
    return { next: draft, note: "does not fit on the map" };
  }
  if (tool === "door") {
    if (!indices(draft, box).every((i) => draft.wall[i] !== null)) {
      return { next: draft, note: `a doorway needs ${String(DOOR_SPAN)} wall cells in a row` };
    }
    next.doors = [
      ...draft.doors.filter((door) => !overlaps(door, box)),
      { ...box, kind: kinds.door },
    ];
    return { next, note: null };
  }
  if (indices(draft, box).some((i) => draft.wall[i] !== null)) {
    return { next: draft, note: "furniture cannot stand in a wall" };
  }
  if (draft.objects.some((object) => overlaps(object, box))) {
    return { next: draft, note: "something already stands there" };
  }
  next.objects = [...draft.objects, { ...box, kind: kinds.object }];
  return { next, note: null };
}

/** The right button: clears walls and rooms in the area and removes whatever it touches. */
export function erase(draft: Draft, rect: Rect): Painted {
  const next = copy(draft);
  for (const i of indices(draft, rect)) {
    next.wall[i] = null;
    next.room[i] = null;
  }
  next.doors = draft.doors.filter((door) => !overlaps(door, rect));
  next.objects = draft.objects.filter((object) => !overlaps(object, rect));
  return { next, note: null };
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
  doors: draft.doors.map((door) => ({ ...door })),
  objects: draft.objects.map((object) => ({ ...object })),
});

/** A saved office back into a draft, so it can be edited again. */
export function fromOffice(office: OfficeLayout): Draft {
  const draft = emptyDraft(office.name, office.width, office.height);
  draft.id = office.id;
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
  draft.doors = office.doors.map((door) => ({ ...door }));
  draft.objects = office.objects.map((object) => ({ ...object }));
  return draft;
}

/** What the office renderer draws: the draft compiled exactly like a saved office would be. */
export const draftLayout = (draft: Draft): Layout => layoutFromOffice(toOffice(draft));
