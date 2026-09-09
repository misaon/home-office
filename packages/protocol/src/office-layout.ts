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

/**
 * How many cells wide a door opening is. Prison Architect's door is one tile, but its tile is about a
 * metre; this grid is finer — a cell is roughly 25 cm — so four cells is a one-metre doorway.
 */
export const DOOR_SPAN = 4;

/** Furniture the editor places. Sizes are the owner's, at roughly 25 cm per cell. */
export const ObjectKind = z.enum(["plant", "desk", "chair"]);
export type ObjectKind = z.infer<typeof ObjectKind>;

/** Footprint in cells, unrotated (`w` across, `h` down). Rotating an object swaps the two. */
export const OBJECT_SIZE: Readonly<Record<ObjectKind, { w: number; h: number }>> = {
  plant: { w: 2, h: 2 },
  desk: { w: 3, h: 6 },
  chair: { w: 2, h: 2 },
};

/** Whether movement has to go around it. A chair is sat on, so it does not block. */
export const OBJECT_BLOCKS: Readonly<Record<ObjectKind, boolean>> = {
  plant: true,
  desk: true,
  chair: false,
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
  /** A doorway spans wall cells and is what makes them passable; the rectangle carries its direction. */
  doors: z.array(LayoutRect.extend({ kind: DoorKind })).max(1000),
  /** Furniture, with the footprint it was placed at (rotation is already in `w`/`h`). */
  objects: z.array(LayoutRect.extend({ kind: ObjectKind })).max(4000),
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
