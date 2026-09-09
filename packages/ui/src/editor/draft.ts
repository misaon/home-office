import {
  DOOR_SPAN,
  type DoorKind,
  type Facing,
  OBJECT_SPEC,
  type ObjectKind,
  type RoomKind,
  type WallMaterial,
} from "@ho/protocol";

/** What the editor paints with. Erasing is the right button, not a tool of its own. */
export type Tool = "wall" | "room" | "door" | "object";

export type Rect = { x: number; y: number; w: number; h: number };

/** What the palette is set to. The piece in hand faces this way, and its footprint turns with it. */
export type Kinds = {
  wall: WallMaterial;
  room: RoomKind;
  door: DoorKind;
  object: ObjectKind;
  facing: Facing;
};

const TURN: Readonly<Record<Facing, Facing>> = { n: "e", e: "s", s: "w", w: "n" };

/** A quarter turn: the piece in hand faces the next way round, and its footprint follows. */
export const rotate = (kinds: Kinds): Kinds => ({ ...kinds, facing: TURN[kinds.facing] });

/** Sideways facings lay the footprint on its side. */
const turned = (facing: Facing): boolean => facing === "e" || facing === "w";

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
  doors: (Rect & { kind: DoorKind; facing: Facing })[];
  objects: (Rect & { kind: ObjectKind; facing: Facing })[];
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

const copy = (draft: Draft): Draft => ({
  ...draft,
  wall: [...draft.wall],
  room: [...draft.room],
  doors: [...draft.doors],
  objects: [...draft.objects],
});

/**
 * A doorway lies across the way it opens: swinging north or south it spans four cells of a horizontal
 * wall, swinging east or west four cells of a vertical one — the right button turns it, exactly like a
 * piece of furniture. It is then slid along that wall until all four cells sit on it, preferring the
 * position centred on the click: a click three cells from the end of a wall still cuts a door, which is
 * what makes the tool usable on a real drawing.
 */
const doorRect = (draft: Draft, at: Rect, kinds: Kinds): Rect => {
  const vertical = turned(kinds.facing);
  const along = vertical ? at.y : at.x;
  const rectAt = (start: number): Rect =>
    vertical
      ? { x: at.x, y: start, w: 1, h: DOOR_SPAN }
      : { x: start, y: at.y, w: DOOR_SPAN, h: 1 };
  const onWall = (rect: Rect): boolean =>
    indices(draft, rect).length === DOOR_SPAN &&
    indices(draft, rect).every((i) => draft.wall[i] !== null);
  // Centred on the click first, then sliding back towards the start of the wall.
  const centred = along - Math.floor((DOOR_SPAN - 1) / 2);
  for (const start of [centred, centred - 1, along, along - (DOOR_SPAN - 1)]) {
    const rect = rectAt(start);
    if (onWall(rect)) {
      return rect;
    }
  }
  // Nothing fits: keep the fallback on the map, so the refusal names the wall rather than the edge.
  const limit = (vertical ? draft.height : draft.width) - DOOR_SPAN;
  return rectAt(Math.min(Math.max(centred, 0), Math.max(limit, 0)));
};

/**
 * Where a piece lands for a click. Furniture is anchored at the cell clicked; something mounted on a
 * wall puts its **back** row on that cell and grows the way it faces, so clicking the wall hangs it
 * there and a lift car juts into the room rather than into the wall.
 */
const footprint = (at: Rect, kinds: Kinds): Rect => {
  const size = OBJECT_SPEC[kinds.object];
  const sideways = turned(kinds.facing);
  const w = sideways ? size.h : size.w;
  const h = sideways ? size.w : size.h;
  if (!size.onWall) {
    return { x: at.x, y: at.y, w, h };
  }
  return {
    x: kinds.facing === "w" ? at.x - (w - 1) : at.x,
    y: kinds.facing === "n" ? at.y - (h - 1) : at.y,
    w,
    h,
  };
};

/**
 * The row at a piece's back — the side opposite the way it faces — and whether all of it is wall. A
 * one-cell-deep fitting is entirely that row; a lift car five by two has its back row in the wall and
 * the rest of it in the room.
 */
const backOnWall = (draft: Draft, box: Rect, facing: Facing): boolean => {
  const back =
    facing === "s"
      ? { x: box.x, y: box.y, w: box.w, h: 1 }
      : facing === "n"
        ? { x: box.x, y: box.y + box.h - 1, w: box.w, h: 1 }
        : facing === "e"
          ? { x: box.x, y: box.y, w: 1, h: box.h }
          : { x: box.x + box.w - 1, y: box.y, w: 1, h: box.h };
  const row = indices(draft, back);
  return row.length === back.w * back.h && row.every((i) => draft.wall[i] !== null);
};

/** Whether a rectangle sits on wall or against one — a doorway in the middle of a room touches none. */
const touchesWall = (draft: Draft, rect: Rect): boolean => {
  const around = {
    x: rect.x - 1,
    y: rect.y - 1,
    w: rect.w + 2,
    h: rect.h + 2,
  };
  return indices(draft, around).some((i) => draft.wall[i] !== null);
};

export type Painted = { next: Draft; note: string | null };

/** The cells an object would take if it were placed here, so the cursor can show them before the click. */
export const ghostAt = (
  draft: Draft,
  at: { x: number; y: number },
  tool: Tool,
  kinds: Kinds,
): Rect =>
  tool === "door"
    ? doorRect(draft, { ...at, w: 1, h: 1 }, kinds)
    : footprint({ ...at, w: 1, h: 1 }, kinds);

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
  const box = tool === "door" ? doorRect(draft, rect, kinds) : footprint(rect, kinds);
  if (!inside(draft, box)) {
    return { next: draft, note: "does not fit on the map" };
  }
  const covered = indices(draft, box);
  if (tool === "door") {
    // A doorway either cuts into a wall or fills the opening left between two of them; both are how an
    // office gets drawn, so the click always places one and only says when it touches no wall at all.
    next.doors = [
      ...draft.doors.filter((door) => !overlaps(door, box)),
      { ...box, kind: kinds.door, facing: kinds.facing },
    ];
    return { next, note: touchesWall(draft, box) ? null : "this doorway touches no wall" };
  }
  const spec = OBJECT_SPEC[kinds.object];
  if (spec.onWall && !backOnWall(draft, box, kinds.facing)) {
    return { next: draft, note: `${kinds.object} hangs on a wall — click the wall itself` };
  }
  if (!spec.onWall && covered.some((i) => draft.wall[i] !== null)) {
    return { next: draft, note: "furniture cannot stand in a wall" };
  }
  if (draft.objects.some((object) => overlaps(object, box))) {
    return { next: draft, note: "something already stands there" };
  }
  next.objects = [...draft.objects, { ...box, kind: kinds.object, facing: kinds.facing }];
  return { next, note: null };
}

/**
 * The right button erases, and only what the active tool paints: dragging over a wall with the room tool
 * clears the designation and leaves the wall standing.
 */
export function erase(draft: Draft, tool: Tool, rect: Rect): Painted {
  const next = copy(draft);
  if (tool === "wall" || tool === "room") {
    for (const i of indices(draft, rect)) {
      if (tool === "wall") {
        next.wall[i] = null;
      } else {
        next.room[i] = null;
      }
    }
  } else if (tool === "door") {
    next.doors = draft.doors.filter((door) => !overlaps(door, rect));
  } else {
    next.objects = draft.objects.filter((object) => !overlaps(object, rect));
  }
  return { next, note: null };
}
