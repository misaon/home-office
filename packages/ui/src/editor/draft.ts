import {
  DOOR_SPAN,
  type DoorKind,
  type Facing,
  type LayoutRect,
  OBJECT_SPEC,
  type ObjectKind,
  type RoomKind,
  type WallMaterial,
} from "@ho/protocol";
import { cellsOf } from "@ho/sim";

/** What the editor paints with. Erasing is the right button, not a tool of its own. */
export type Tool = "wall" | "room" | "door" | "object";

/** What is in hand: the palette's choice per tool, and the way the piece being placed faces. */
export type Brush = {
  wall: WallMaterial;
  room: RoomKind;
  door: DoorKind;
  object: ObjectKind;
  facing: Facing;
};

const TURN: Readonly<Record<Facing, Facing>> = { n: "e", e: "s", s: "w", w: "n" };

/** A quarter turn: the piece in hand faces the next way round, and its footprint follows. */
export const rotate = (brush: Brush): Brush => ({ ...brush, facing: TURN[brush.facing] });

/** Sideways facings lay the footprint on its side. */
const turned = (facing: Facing): boolean => facing === "e" || facing === "w";

/**
 * While drawing, walls and rooms are kept per cell — erasing a corner out of a rectangle is then a
 * single assignment. Doors and furniture stay as placed rectangles, because their footprint carries a
 * direction that per-cell painting would lose.
 */
export type OfficeDraft = {
  id: string;
  name: string;
  width: number;
  height: number;
  wall: (WallMaterial | null)[];
  room: (RoomKind | null)[];
  doors: (LayoutRect & { kind: DoorKind; facing: Facing })[];
  objects: (LayoutRect & { kind: ObjectKind; facing: Facing })[];
};

const cells = <T>(count: number): (T | null)[] => Array.from({ length: count }, () => null);

/** The office's name becomes the file's name: lowercase, dashes, nothing else. */
export const slugify = (name: string): string => {
  const slug = name
    .toLowerCase()
    // "Nová kancelář" is a file name too: the accents are decomposed and dropped so the letters they
    // sit on survive, instead of the whole character going with them.
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll(/[^a-z\d]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replaceAll(/-+$/gu, "");
  return slug === "" ? "office" : slug;
};

export const emptyDraft = (name: string, width: number, height: number): OfficeDraft => ({
  id: slugify(name),
  name,
  width,
  height,
  wall: cells(width * height),
  room: cells(width * height),
  doors: [],
  objects: [],
});

const inside = (draft: OfficeDraft, rect: LayoutRect): boolean =>
  rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= draft.width && rect.y + rect.h <= draft.height;

const overlaps = (a: LayoutRect, b: LayoutRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const indices = (draft: OfficeDraft, rect: LayoutRect): number[] => [
  ...cellsOf(rect, draft.width, draft.height),
];

const copy = (draft: OfficeDraft): OfficeDraft => ({
  ...draft,
  wall: [...draft.wall],
  room: [...draft.room],
  doors: [...draft.doors],
  objects: [...draft.objects],
});

/**
 * A doorway lies across the way it opens: swinging north or south it spans cells of a horizontal wall,
 * swinging east or west cells of a vertical one — the right button turns it, exactly like a piece of
 * furniture. It is then slid along that wall until all its cells sit on it, preferring the position centred
 * on the click: a click near the end of a wall still cuts a door, which is what makes the tool usable.
 */
const doorRect = (draft: OfficeDraft, at: LayoutRect, brush: Brush): LayoutRect => {
  const vertical = turned(brush.facing);
  const along = vertical ? at.y : at.x;
  const rectAt = (start: number): LayoutRect =>
    vertical
      ? { x: at.x, y: start, w: 1, h: DOOR_SPAN }
      : { x: start, y: at.y, w: DOOR_SPAN, h: 1 };
  const onWall = (rect: LayoutRect): boolean => {
    const covered = indices(draft, rect);
    return covered.length === DOOR_SPAN && covered.every((i) => draft.wall[i] !== null);
  };
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
const footprint = (at: LayoutRect, brush: Brush): LayoutRect => {
  const size = OBJECT_SPEC[brush.object];
  const sideways = turned(brush.facing);
  const w = sideways ? size.h : size.w;
  const h = sideways ? size.w : size.h;
  if (!size.onWall) {
    return { x: at.x, y: at.y, w, h };
  }
  return {
    x: brush.facing === "w" ? at.x - (w - 1) : at.x,
    y: brush.facing === "n" ? at.y - (h - 1) : at.y,
    w,
    h,
  };
};

/**
 * The row at a piece's back — the side opposite the way it faces — and whether all of it is wall. A
 * one-cell-deep fitting is entirely that row; a lift car five by two has its back row in the wall and
 * the rest of it in the room.
 */
const backOnWall = (draft: OfficeDraft, box: LayoutRect, facing: Facing): boolean => {
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
const touchesWall = (draft: OfficeDraft, rect: LayoutRect): boolean =>
  indices(draft, { x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 }).some(
    (i) => draft.wall[i] !== null,
  );

/** Why a paint was refused: a dictionary key, and the piece it is about when the key names one. */
export type Note = {
  key:
    | "editor.noteNoFit"
    | "editor.noteNoWall"
    | "editor.noteOnWall"
    | "editor.noteInWall"
    | "editor.noteOccupied";
  name?: string;
};
export type Painted = { next: OfficeDraft; note: Note | null };

/** The cells an object would take if it were placed here, so the cursor can show them before the click. */
export const ghostAt = (
  draft: OfficeDraft,
  at: { x: number; y: number },
  tool: Tool,
  brush: Brush,
): LayoutRect =>
  tool === "door"
    ? doorRect(draft, { ...at, w: 1, h: 1 }, brush)
    : footprint({ ...at, w: 1, h: 1 }, brush);

/** Paints with the active tool. Doors need wall to cut through; furniture needs the room to be free. */
export function paint(draft: OfficeDraft, tool: Tool, rect: LayoutRect, brush: Brush): Painted {
  const next = copy(draft);
  if (tool === "wall" || tool === "room") {
    for (const i of indices(draft, rect)) {
      if (tool === "wall") {
        next.wall[i] = brush.wall;
      } else {
        next.room[i] = brush.room;
      }
    }
    return { next, note: null };
  }
  const box = tool === "door" ? doorRect(draft, rect, brush) : footprint(rect, brush);
  if (!inside(draft, box)) {
    return { next: draft, note: { key: "editor.noteNoFit" } };
  }
  if (tool === "door") {
    // A doorway either cuts into a wall or fills the opening left between two of them; both are how an
    // office gets drawn, so the click always places one and only says when it touches no wall at all.
    next.doors = [
      ...draft.doors.filter((door) => !overlaps(door, box)),
      { ...box, kind: brush.door, facing: brush.facing },
    ];
    return { next, note: touchesWall(draft, box) ? null : { key: "editor.noteNoWall" } };
  }
  const spec = OBJECT_SPEC[brush.object];
  if (spec.onWall && !backOnWall(draft, box, brush.facing)) {
    return { next: draft, note: { key: "editor.noteOnWall", name: brush.object } };
  }
  if (!spec.onWall && indices(draft, box).some((i) => draft.wall[i] !== null)) {
    return { next: draft, note: { key: "editor.noteInWall" } };
  }
  if (draft.objects.some((object) => overlaps(object, box))) {
    return { next: draft, note: { key: "editor.noteOccupied" } };
  }
  next.objects = [...draft.objects, { ...box, kind: brush.object, facing: brush.facing }];
  return { next, note: null };
}

/**
 * The right button erases, and only what the active tool paints: dragging over a wall with the room tool
 * clears the designation and leaves the wall standing.
 */
export function erase(draft: OfficeDraft, tool: Tool, rect: LayoutRect): Painted {
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
