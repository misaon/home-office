import type { Anchor, AnchorKind, FloorTemplate } from "./templates.ts";

/**
 * Pixels per cell on the stage. The office has no art any more — the renderer draws a white plane and one
 * dot per character — so this is only the unit the camera scales and positions are expressed in.
 */
export const CELL_PX = 24;

/** The blank plane every floor is, in cells. */
export const PLANE = { width: 48, height: 28 } as const;

/** Floor id when nobody asks for another; the app uses one floor per project. */
export const PLANE_FLOOR_ID = "plane";

/** Lola's spot: the roster settles the receptionist on this anchor by id. */
export const RECEPTION_ANCHOR = "reception-staff";

const at = (
  id: string,
  kind: AnchorKind,
  x: number,
  y: number,
  facing: Anchor["facing"] = "s",
  group?: string,
): Anchor =>
  group === undefined
    ? { id, kind, at: { x, y }, facing }
    : {
        id,
        kind,
        at: { x, y },
        facing,
        group,
      };

/** Twelve seats in four columns, the only structure the plane has until the new mechanic defines one. */
const desks = (): Anchor[] =>
  [0, 1, 2].flatMap((row) =>
    [0, 1, 2, 3].map((column) =>
      at(`desk-${String(row)}-${String(column)}`, "desk", 16 + column * 6, 6 + row * 6),
    ),
  );

/**
 * The plane's named spots. They keep the existing movement working — arriving by the lift, taking a seat,
 * fetching coffee, strolling — without a single wall, room or piece of furniture.
 */
const anchors = (): Anchor[] => [
  at("car", "car", 2, 14, "e"),
  at("elevator", "elevator", 4, 14, "e"),
  at("entrance", "entrance", 6, 14, "e"),
  at(RECEPTION_ANCHOR, "reception", 9, 14, "e"),
  at("mailbox", "mailbox", 9, 11),
  at("boss-desk", "boss-desk", 42, 5, "s", "boss"),
  ...desks(),
  at("coffee", "coffee", 12, 22),
  at("restroom", "restroom", 18, 24),
  at("smoke", "smoke", 44, 24),
  at("relax", "relax", 30, 22),
  at("sleep", "sleep", 36, 20),
  ...[
    { x: 10, y: 18 },
    { x: 24, y: 18 },
    { x: 38, y: 18 },
    { x: 20, y: 10 },
    { x: 32, y: 26 },
    { x: 44, y: 14 },
  ].map((spot, i) => at(`wander-${String(i + 1)}`, "wander", spot.x, spot.y)),
];

/** The floor of a project: a bare walkable plane with the spots its characters move between. */
export const planeTemplate = (floorId: string = PLANE_FLOOR_ID): FloorTemplate => ({
  id: floorId,
  name: "Plane",
  width: PLANE.width,
  height: PLANE.height,
  anchors: anchors(),
});
