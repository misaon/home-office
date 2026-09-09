import type { Facing } from "./grid.ts";
import { compileLayout, type Layout } from "./layout.ts";
import type { Anchor, AnchorKind, FloorTemplate } from "./templates.ts";

/** Lola's spot: the roster settles the receptionist on this anchor by id. */
export const RECEPTION_ANCHOR = "reception-staff";

/**
 * Every office is this many cells, and the map is the office — nothing surrounds it. 50:34 is a shade
 * wider than the pane a maximised 1920 × 1080 window leaves (1480 × 1027 px once the 440 px panel and
 * the 53 px bar come off, ratio 1.441 against the floor's 1.471), so the floor is limited by the pane's
 * width rather than its height: no margin at the sides, ten pixels above and below, and the sides stay
 * clean as the window loses height to a menu bar or dock. Zooming in is for looking at one room;
 * zooming out stops at the whole floor.
 */
export const OFFICE = { width: 50, height: 34 } as const;

const spot = (
  id: string,
  kind: AnchorKind,
  x: number,
  y: number,
  facing: Facing = "s",
  group?: string,
): Anchor =>
  group === undefined
    ? { id, kind, at: { x, y }, facing }
    : { id, kind, at: { x, y }, facing, group };

/** Twelve seats in four columns, the only structure the empty office has. */
const desks = (): Anchor[] =>
  [0, 1, 2].flatMap((row) =>
    [0, 1, 2, 3].map((column) =>
      spot(`desk-${String(row)}-${String(column)}`, "desk", 14 + column * 7, 6 + row * 7),
    ),
  );

const strolls = (): Anchor[] =>
  [
    { x: 8, y: 22 },
    { x: 20, y: 26 },
    { x: 36, y: 22 },
    { x: 18, y: 10 },
    { x: 28, y: 32 },
    { x: 47, y: 17 },
  ].map((at, i) => spot(`wander-${String(i + 1)}`, "wander", at.x, at.y));

/**
 * The office as it stands while its own design is being written: the whole map is floor, with no walls,
 * no rooms and no objects yet — only the spots the characters move between.
 */
const emptyOffice = (): Layout => ({
  id: "empty-office",
  name: "Empty office",
  width: OFFICE.width,
  height: OFFICE.height,
  floors: [{ at: { x: 0, y: 0 }, w: OFFICE.width, h: OFFICE.height, material: "office" }],
  walls: [],
  rooms: [],
  objects: [],
  anchors: [
    spot("car", "car", 1, 17, "e"),
    spot("elevator", "elevator", 3, 17, "e"),
    spot("entrance", "entrance", 5, 17, "e"),
    spot(RECEPTION_ANCHOR, "reception", 8, 17, "e"),
    spot("mailbox", "mailbox", 8, 14),
    spot("boss-desk", "boss-desk", 44, 4, "s", "boss"),
    ...desks(),
    spot("coffee", "coffee", 11, 28),
    spot("restroom", "restroom", 17, 31),
    spot("smoke", "smoke", 46, 31),
    spot("relax", "relax", 28, 28),
    spot("sleep", "sleep", 34, 25),
    ...strolls(),
  ],
});

/** Every office written in code. A floor picks one by id, so floors can differ later. */
const LAYOUTS = { "empty-office": emptyOffice } as const satisfies Record<string, () => Layout>;

export type LayoutId = keyof typeof LAYOUTS;
export const DEFAULT_LAYOUT: LayoutId = "empty-office";

/** The floor of a project: a layout compiled under that floor's id. */
export const floorTemplate = (floorId: string, layout: LayoutId = DEFAULT_LAYOUT): FloorTemplate =>
  compileLayout(floorId, LAYOUTS[layout]());
