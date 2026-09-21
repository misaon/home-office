import { z } from "zod";

export const RoomKind = z.enum([
  "reception",
  "boss-office",
  "office-developers",
  "office-qa",
  "office-analysts",
  "team-room",
  "meeting",
  "kitchen",
  "toilets",
  "corridor",
  "terrace",
]);
export type RoomKind = z.infer<typeof RoomKind>;

const RENAMED_ROOMS: Readonly<Record<string, RoomKind>> = { restroom: "toilets" };
const StoredRoomKind = z.preprocess(
  (value) => (typeof value === "string" ? (RENAMED_ROOMS[value] ?? value) : value),
  RoomKind,
);

export const WallMaterial = z.enum(["wall", "glass"]);
export type WallMaterial = z.infer<typeof WallMaterial>;

export const DoorKind = z.enum(["door", "glass-door"]);
export type DoorKind = z.infer<typeof DoorKind>;

export const Facing = z.enum(["n", "e", "s", "w"]);
export type Facing = z.infer<typeof Facing>;

export const DOOR_SPAN = 2;

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

const RENAMED_OBJECTS: Readonly<Record<string, ObjectKind>> = {
  desk: "desk-developer",
  chair: "office-chair",
};
const StoredObjectKind = z.preprocess(
  (value) => (typeof value === "string" ? (RENAMED_OBJECTS[value] ?? value) : value),
  ObjectKind,
);

type ObjectSpec = {
  w: number;
  h: number;
  blocks: boolean;
  onWall: boolean;
  arrow: boolean;
  walkable?: boolean;
};

export const OBJECT_SPEC: Readonly<Record<ObjectKind, ObjectSpec>> = {
  elevator: { w: 5, h: 2, blocks: false, onWall: true, arrow: true, walkable: true },
  "desk-developer": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-qa": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-analyst": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "desk-boss": { w: 6, h: 3, blocks: true, onWall: false, arrow: true },
  "reception-counter": { w: 8, h: 2, blocks: true, onWall: false, arrow: true },
  "meeting-table": { w: 7, h: 3, blocks: true, onWall: false, arrow: false },
  "office-chair": { w: 2, h: 2, blocks: false, onWall: false, arrow: true },
  "lounge-chair": { w: 3, h: 3, blocks: false, onWall: false, arrow: true },
  "dining-table": { w: 7, h: 3, blocks: true, onWall: false, arrow: false },
  "dining-chair": { w: 2, h: 2, blocks: false, onWall: false, arrow: true },
  "kitchen-counter": { w: 4, h: 3, blocks: true, onWall: false, arrow: true },
  fridge: { w: 3, h: 2, blocks: true, onWall: false, arrow: true },
  "coffee-machine": { w: 2, h: 2, blocks: true, onWall: false, arrow: true },
  grill: { w: 5, h: 2, blocks: true, onWall: false, arrow: true },
  "hot-tub": { w: 5, h: 5, blocks: true, onWall: false, arrow: false },
  bookcase: { w: 8, h: 1, blocks: true, onWall: false, arrow: true },
  plant: { w: 2, h: 2, blocks: true, onWall: false, arrow: false },
  picture: { w: 3, h: 1, blocks: false, onWall: true, arrow: true },
  "air-conditioning": { w: 4, h: 1, blocks: false, onWall: true, arrow: true },
  window: { w: 4, h: 1, blocks: false, onWall: true, arrow: false },
  toilet: { w: 2, h: 2, blocks: true, onWall: false, arrow: true },
  sink: { w: 2, h: 2, blocks: true, onWall: false, arrow: true },
  "hand-dryer": { w: 1, h: 1, blocks: false, onWall: true, arrow: true },
  bin: { w: 2, h: 2, blocks: true, onWall: false, arrow: false },
  "standing-ashtray": { w: 1, h: 1, blocks: true, onWall: false, arrow: false },
};

export const objectSize = (kind: ObjectKind, facing: Facing): { w: number; h: number } => {
  const spec = OBJECT_SPEC[kind];
  return facing === "e" || facing === "w" ? { w: spec.h, h: spec.w } : { w: spec.w, h: spec.h };
};

export const LAYOUT_MAX = 200;

export const LayoutCell = z.int().min(0).max(LAYOUT_MAX);
export const LayoutSpan = z.int().min(1).max(LAYOUT_MAX);

const LayoutRect = z.object({ x: LayoutCell, y: LayoutCell, w: LayoutSpan, h: LayoutSpan });
export type LayoutRect = z.infer<typeof LayoutRect>;

export const OfficeLayout = z.object({
  id: z.string().regex(/^[a-z\d][a-z\d-]{0,63}$/u, "use lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(80),
  width: z.int().min(4).max(LAYOUT_MAX),
  height: z.int().min(4).max(LAYOUT_MAX),
  walls: z.array(LayoutRect.extend({ material: WallMaterial })).max(4000),
  rooms: z.array(LayoutRect.extend({ room: StoredRoomKind })).max(4000),
  doors: z.array(LayoutRect.extend({ kind: DoorKind, facing: Facing })).max(1000),
  objects: z.array(LayoutRect.extend({ kind: StoredObjectKind, facing: Facing })).max(4000),
});
export type OfficeLayout = z.infer<typeof OfficeLayout>;

export const LayoutSaved = z.object({ id: OfficeLayout.shape.id, path: z.string() });
export type LayoutSaved = z.infer<typeof LayoutSaved>;

export const LayoutStore = z.object({
  available: z.boolean(),
  directory: z.string().nullable(),
  layouts: z.array(OfficeLayout),
});
export type LayoutStore = z.infer<typeof LayoutStore>;
