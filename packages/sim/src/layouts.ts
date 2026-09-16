import type { Facing, OfficeLayout } from "@ho/protocol";
import { type Anchor, type AnchorKind, compileLayout, type FloorTemplate } from "./map.ts";

export const RECEPTION_ANCHOR = "reception-staff";

export const OFFICE_SIZE = { width: 60, height: 34 } as const;

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

const DESK_ZONES = ["dev", "dev", "qa", "analyst"] as const;

const desks = (): Anchor[] =>
  [0, 1, 2].flatMap((row) =>
    [0, 1, 2, 3].map((column) =>
      spot(
        `desk-${String(row)}-${String(column)}`,
        "desk",
        19 + column * 7,
        6 + row * 7,
        "s",
        DESK_ZONES[column],
      ),
    ),
  );

const strolls = (): Anchor[] =>
  [
    { x: 13, y: 22 },
    { x: 25, y: 26 },
    { x: 41, y: 22 },
    { x: 23, y: 10 },
    { x: 33, y: 32 },
    { x: 52, y: 17 },
  ].map((at, i) => spot(`wander-${String(i + 1)}`, "wander", at.x, at.y));

const EMPTY_OFFICE: OfficeLayout = {
  id: "empty-office",
  name: "Empty office",
  width: OFFICE_SIZE.width,
  height: OFFICE_SIZE.height,
  walls: [],
  rooms: [],
  doors: [],
  objects: [],
};

const ANCHORS: readonly Anchor[] = [
  spot("car", "car", 6, 17, "e"),
  spot("elevator", "elevator", 8, 17, "e"),
  spot("entrance", "entrance", 10, 17, "e"),
  spot(RECEPTION_ANCHOR, "reception", 13, 17, "e"),
  spot("mailbox", "mailbox", 13, 14),
  spot("boss-desk", "boss-desk", 49, 4, "s", "boss"),
  ...desks(),
  spot("coffee", "coffee", 16, 28),
  spot("restroom", "restroom", 22, 31),
  spot("smoke", "smoke", 51, 31),
  spot("relax", "relax", 33, 28),
  spot("sleep", "sleep", 39, 25),
  ...strolls(),
];

export const floorTemplate = (floorId: string): FloorTemplate =>
  compileLayout(floorId, EMPTY_OFFICE, ANCHORS);
