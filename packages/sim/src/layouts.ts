import type { Facing, Point } from "./grid.ts";
import { compileLayout, type Layout } from "./layout.ts";
import type { Anchor, AnchorKind, FloorTemplate } from "./templates.ts";

/** Lola's spot: the roster settles the receptionist on this anchor by id. */
export const RECEPTION_ANCHOR = "reception-staff";

/** The map every layout is authored on, in cells. Zoom and panning cover it; the office sits inside it. */
export const MAP = { width: 100, height: 70 } as const;

/** Where the empty office's floor sits on the map, and how large it is. */
const OFFICE = { at: { x: 26, y: 21 }, w: 48, h: 28 } as const;

const on = (x: number, y: number): Point => ({ x: OFFICE.at.x + x, y: OFFICE.at.y + y });

const spot = (
  id: string,
  kind: AnchorKind,
  x: number,
  y: number,
  facing: Facing = "s",
  group?: string,
): Anchor =>
  group === undefined
    ? { id, kind, at: on(x, y), facing }
    : { id, kind, at: on(x, y), facing, group };

/** Twelve seats in four columns, the only structure the empty office has. */
const desks = (): Anchor[] =>
  [0, 1, 2].flatMap((row) =>
    [0, 1, 2, 3].map((column) =>
      spot(`desk-${String(row)}-${String(column)}`, "desk", 16 + column * 6, 6 + row * 6),
    ),
  );

const strolls = (): Anchor[] =>
  [
    { x: 10, y: 18 },
    { x: 24, y: 18 },
    { x: 38, y: 18 },
    { x: 20, y: 10 },
    { x: 32, y: 26 },
    { x: 44, y: 14 },
  ].map((at, i) => spot(`wander-${String(i + 1)}`, "wander", at.x, at.y));

/**
 * The office as it stands while its own design is being written: one rectangle of floor on the map, no
 * walls, no rooms and no objects yet — only the spots the characters move between.
 */
const emptyOffice = (): Layout => ({
  id: "empty-office",
  name: "Empty office",
  width: MAP.width,
  height: MAP.height,
  floors: [{ ...OFFICE, material: "office" }],
  walls: [],
  rooms: [],
  objects: [],
  anchors: [
    spot("car", "car", 2, 14, "e"),
    spot("elevator", "elevator", 4, 14, "e"),
    spot("entrance", "entrance", 6, 14, "e"),
    spot(RECEPTION_ANCHOR, "reception", 9, 14, "e"),
    spot("mailbox", "mailbox", 9, 11),
    spot("boss-desk", "boss-desk", 42, 5, "s", "boss"),
    ...desks(),
    spot("coffee", "coffee", 12, 22),
    spot("restroom", "restroom", 18, 24),
    spot("smoke", "smoke", 44, 24),
    spot("relax", "relax", 30, 22),
    spot("sleep", "sleep", 36, 20),
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
