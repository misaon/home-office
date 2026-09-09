import { z } from "zod";

/** Rooms a drawn office can designate; behaviour and art will hang off these ids, so the list is closed. */
export const RoomKind = z.enum([
  "reception",
  "boss-office",
  "team-room",
  "meeting",
  "kitchen",
  "restroom",
  "corridor",
  "terrace",
]);
export type RoomKind = z.infer<typeof RoomKind>;

/** What a wall is made of. A material id, never a colour: the sprite that lands later replaces the fill. */
export const WallMaterial = z.enum(["wall", "glass"]);
export type WallMaterial = z.infer<typeof WallMaterial>;

export const DoorKind = z.enum(["door", "glass-door"]);
export type DoorKind = z.infer<typeof DoorKind>;

/** Which way a piece is turned: the door swings, the desk is sat at, the air conditioner blows. */
export const Facing = z.enum(["n", "e", "s", "w"]);
export type Facing = z.infer<typeof Facing>;

/**
 * How many cells wide a door opening is: two, which at roughly 25 cm per cell is 50 cm — exactly one
 * employee, who is two cells across. Narrow for a real door, and the owner's choice.
 */
export const DOOR_SPAN = 2;

/**
 * Everything the editor can place. Footprints are in cells of roughly 25 cm, derived from the real
 * pieces: a developer's desk is 160 × 80 cm, a dining chair 45 × 45, a meeting table 300 × 120. `blocks`
 * is whether movement has to go around it — a chair is sat on, a window is looked through. `onWall`
 * pieces hang on a wall and leave it standing (unlike a door, which opens it) — the row at their back,
 * the side opposite the way they face, is what has to be wall, so a thin fitting sits in the wall while
 * a lift car juts into the room. `arrow` marks the pieces whose direction matters: which way a desk is
 * faced, an air conditioner blows, a picture looks, a lift opens.
 */
export const ObjectKind = z.enum([
  "elevator",
  "desk-developer",
  "desk-qa",
  "desk-analyst",
  "desk-boss",
  "reception-counter",
  "meeting-table",
  "office-chair",
  "lounge-chair",
  "dining-table",
  "dining-chair",
  "kitchen-counter",
  "fridge",
  "coffee-machine",
  "grill",
  "hot-tub",
  "bookcase",
  "plant",
  "picture",
  "air-conditioning",
  "window",
  "toilet",
  "sink",
  "hand-dryer",
  "bin",
  "standing-ashtray",
]);
export type ObjectKind = z.infer<typeof ObjectKind>;

export type ObjectSpec = {
  /** Cells across and down, unrotated; rotating swaps them. */
  w: number;
  h: number;
  blocks: boolean;
  onWall: boolean;
  arrow: boolean;
};

export const OBJECT_SPEC: Readonly<Record<ObjectKind, ObjectSpec>> = {
  // The lift car: where staff arrive on the floor. It hangs on a wall as the fittings do, five cells
  // along it and two deep, and is walked into.
  elevator: { w: 5, h: 2, blocks: false, onWall: true, arrow: true },
  // Desks: 160 × 80 cm for the team, 200 × 90 for the boss, a 240 × 70 counter at reception.
  "desk-developer": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-qa": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-analyst": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-boss": { w: 8, h: 4, blocks: true, onWall: false, arrow: true },
  "reception-counter": { w: 10, h: 3, blocks: true, onWall: false, arrow: true },
  // 3 × 1.2 m of meeting table.
  "meeting-table": { w: 12, h: 5, blocks: true, onWall: false, arrow: false },
  "office-chair": { w: 2, h: 2, blocks: false, onWall: false, arrow: true },
  "lounge-chair": { w: 3, h: 3, blocks: false, onWall: false, arrow: true },
  "dining-table": { w: 6, h: 4, blocks: true, onWall: false, arrow: false },
  "dining-chair": { w: 2, h: 2, blocks: false, onWall: false, arrow: true },
  // A metre of kitchen run, 60 cm deep.
  "kitchen-counter": { w: 4, h: 3, blocks: true, onWall: false, arrow: true },
  fridge: { w: 3, h: 3, blocks: true, onWall: false, arrow: true },
  "coffee-machine": { w: 2, h: 2, blocks: true, onWall: false, arrow: true },
  grill: { w: 5, h: 2, blocks: true, onWall: false, arrow: true },
  "hot-tub": { w: 8, h: 8, blocks: true, onWall: false, arrow: false },
  bookcase: { w: 3, h: 2, blocks: true, onWall: false, arrow: true },
  plant: { w: 2, h: 2, blocks: true, onWall: false, arrow: false },
  // Mounted on a wall: the cell keeps its wall, the piece hangs on it.
  picture: { w: 3, h: 1, blocks: false, onWall: true, arrow: true },
  "air-conditioning": { w: 4, h: 1, blocks: false, onWall: true, arrow: true },
  window: { w: 5, h: 1, blocks: false, onWall: true, arrow: false },
  toilet: { w: 2, h: 3, blocks: true, onWall: false, arrow: true },
  sink: { w: 2, h: 2, blocks: true, onWall: false, arrow: true },
  "hand-dryer": { w: 1, h: 1, blocks: false, onWall: true, arrow: true },
  bin: { w: 2, h: 2, blocks: true, onWall: false, arrow: false },
  "standing-ashtray": { w: 1, h: 1, blocks: true, onWall: false, arrow: false },
};

/** The largest office the editor will write, in cells; the grid is drawn per cell, so this bounds the work. */
export const LAYOUT_MAX = 200;

const cell = z.int().min(0).max(LAYOUT_MAX);
const span = z.int().min(1).max(LAYOUT_MAX);

const LayoutRect = z.object({ x: cell, y: cell, w: span, h: span });

export const OfficeLayout = z.object({
  /** Names the file it is saved as, so it may only ever be a slug. */
  id: z.string().regex(/^[a-z\d][a-z\d-]{0,63}$/u, "use lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(80),
  width: z.int().min(4).max(LAYOUT_MAX),
  height: z.int().min(4).max(LAYOUT_MAX),
  /** Walls fill whole cells, as in Prison Architect; a one-cell-wide rectangle is a line. */
  walls: z.array(LayoutRect.extend({ material: WallMaterial })).max(4000),
  rooms: z.array(LayoutRect.extend({ room: RoomKind })).max(4000),
  /** A doorway spans wall cells and opens them; `facing` is the way it swings. */
  doors: z.array(LayoutRect.extend({ kind: DoorKind, facing: Facing })).max(1000),
  /** Furniture at the footprint it was placed with (rotation is already in `w`/`h`) and the way it faces. */
  objects: z.array(LayoutRect.extend({ kind: ObjectKind, facing: Facing })).max(4000),
});
export type OfficeLayout = z.infer<typeof OfficeLayout>;

/** Saving answers with what was stored, so the editor can show the file it now matches. */
export const LayoutSaved = z.object({ id: OfficeLayout.shape.id, path: z.string() });
export type LayoutSaved = z.infer<typeof LayoutSaved>;

/**
 * The editor is a local tool: a daemon without a repository to write into (the packaged app) answers
 * `available: false` and the editor says so instead of failing.
 */
export const LayoutStore = z.object({
  available: z.boolean(),
  directory: z.string().nullable(),
  layouts: z.array(OfficeLayout),
});
export type LayoutStore = z.infer<typeof LayoutStore>;
