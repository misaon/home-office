import type { Facing, OfficeLayout, RoomKind } from "@ho/protocol";
import type { Point } from "./grid.ts";
import type { Anchor, AnchorKind, TileMap } from "./map.ts";

export const RECEPTION_ANCHOR = "reception-staff";

type Rect = { x: number; y: number; w: number; h: number };
type Placed = OfficeLayout["objects"][number];

const OPPOSITE: Readonly<Record<Facing, Facing>> = { n: "s", s: "n", e: "w", w: "e" };

const DESK_GROUP: Readonly<Record<string, string>> = {
  "desk-developer": "dev",
  "desk-qa": "qa",
  "desk-analyst": "analyst",
};

const inFront = (rect: Rect, facing: Facing, distance = 1): Point => {
  const middleX = rect.x + Math.floor((rect.w - 1) / 2);
  const middleY = rect.y + Math.floor((rect.h - 1) / 2);
  const front: Readonly<Record<Facing, Point>> = {
    n: { x: middleX, y: rect.y - distance },
    s: { x: middleX, y: rect.y + rect.h - 1 + distance },
    w: { x: rect.x - distance, y: middleY },
    e: { x: rect.x + rect.w - 1 + distance, y: middleY },
  };
  return front[facing];
};

const roomCells = (layout: OfficeLayout, room: RoomKind): Point[] =>
  layout.rooms
    .filter((rect) => rect.room === room)
    .flatMap((rect) =>
      Array.from({ length: rect.h }, (_row, dy) =>
        Array.from({ length: rect.w }, (_column, dx): Point => ({
          x: rect.x + dx,
          y: rect.y + dy,
        })),
      ).flat(),
    );

const blockedAt = (map: TileMap, point: Point): boolean =>
  point.x < 0 ||
  point.y < 0 ||
  point.x >= map.width ||
  point.y >= map.height ||
  map.blocked[point.y * map.width + point.x] === 1;

const free = (map: TileMap, cells: readonly Point[]): Point[] =>
  cells.filter((cell) => !blockedAt(map, cell));

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const nearestTo = (cells: readonly Point[], target: Point): Point | undefined =>
  cells.toSorted((a, b) => distance(a, target) - distance(b, target))[0];

const farthestFrom = (cells: readonly Point[], target: Point): Point | undefined =>
  cells.toSorted((a, b) => distance(b, target) - distance(a, target))[0];

const centroid = (cells: readonly Point[]): Point | undefined => {
  if (cells.length === 0) {
    return undefined;
  }
  const sum = cells.reduce((acc, cell) => ({ x: acc.x + cell.x, y: acc.y + cell.y }), {
    x: 0,
    y: 0,
  });
  return nearestTo(cells, { x: sum.x / cells.length, y: sum.y / cells.length });
};

const spot = (
  id: string,
  kind: AnchorKind,
  at: Point,
  facing: Facing = "s",
  group?: string,
): Anchor => (group === undefined ? { id, kind, at, facing } : { id, kind, at, facing, group });

const seatOf = (map: TileMap, piece: Placed, index: number): Anchor | null => {
  const group = piece.kind === "desk-boss" ? "boss" : DESK_GROUP[piece.kind];
  if (group === undefined) {
    return null;
  }
  const at = inFront(piece, piece.facing);
  if (blockedAt(map, at)) {
    return null;
  }
  const kind: AnchorKind = piece.kind === "desk-boss" ? "boss-desk" : "desk";
  return spot(`${kind}-${String(index + 1)}`, kind, at, OPPOSITE[piece.facing], group);
};

const elevatorAnchors = (map: TileMap, layout: OfficeLayout): Anchor[] => {
  const lift = layout.objects.find((piece) => piece.kind === "elevator");
  if (lift === undefined) {
    return [];
  }
  const car = { x: lift.x + Math.floor(lift.w / 2), y: lift.y + Math.floor(lift.h / 2) };
  const door = inFront(lift, lift.facing);
  const entrance = inFront(lift, lift.facing, 2);
  return [
    spot("car", "car", car, lift.facing),
    ...(blockedAt(map, door) ? [] : [spot("elevator", "elevator", door, lift.facing)]),
    ...(blockedAt(map, entrance) ? [] : [spot("entrance", "entrance", entrance, lift.facing)]),
  ];
};

const receptionAnchors = (map: TileMap, layout: OfficeLayout): Anchor[] => {
  const counter = layout.objects.find((piece) => piece.kind === "reception-counter");
  if (counter !== undefined) {
    const behind = inFront(counter, OPPOSITE[counter.facing]);
    const aside = { x: counter.x - 1, y: counter.y };
    return [
      ...(blockedAt(map, behind)
        ? []
        : [spot(RECEPTION_ANCHOR, "reception", behind, counter.facing)]),
      ...(blockedAt(map, aside) ? [] : [spot("mailbox", "mailbox", aside, counter.facing)]),
    ];
  }
  const cells = free(map, roomCells(layout, "reception"));
  const middle = centroid(cells);
  if (middle === undefined) {
    return [];
  }
  const corner = nearestTo(cells, { x: 0, y: 0 });
  return [
    spot(RECEPTION_ANCHOR, "reception", middle, "w"),
    ...(corner === undefined || (corner.x === middle.x && corner.y === middle.y)
      ? []
      : [spot("mailbox", "mailbox", corner, "n")]),
  ];
};

const fixtureAnchor = (
  map: TileMap,
  layout: OfficeLayout,
  id: string,
  kind: AnchorKind,
  pieces: readonly Placed["kind"][],
  room: RoomKind,
): Anchor[] => {
  const piece = layout.objects.find((candidate) => pieces.includes(candidate.kind));
  if (piece !== undefined) {
    const at = inFront(piece, piece.facing);
    return blockedAt(map, at) ? [] : [spot(id, kind, at, OPPOSITE[piece.facing])];
  }
  const middle = centroid(free(map, roomCells(layout, room)));
  return middle === undefined ? [] : [spot(id, kind, middle)];
};

const WANDER_ROOMS: readonly RoomKind[] = ["terrace", "team-room", "kitchen"];

export function anchorsOf(map: TileMap, layout: OfficeLayout): Anchor[] {
  const seats = layout.objects
    .map((piece, index) => seatOf(map, piece, index))
    .filter((anchor): anchor is Anchor => anchor !== null);
  const smoke = fixtureAnchor(map, layout, "smoke", "smoke", ["standing-ashtray"], "terrace");
  const terrace = free(map, roomCells(layout, "terrace"));
  const smokeSpot = smoke[0]?.at;
  const relaxSpot = smokeSpot === undefined ? centroid(terrace) : farthestFrom(terrace, smokeSpot);
  const relax = fixtureAnchor(
    map,
    layout,
    "relax",
    "relax",
    ["lounge-chair", "hot-tub"],
    "team-room",
  );
  const wander = WANDER_ROOMS.flatMap((room) => {
    const cells = free(map, roomCells(layout, room));
    const middle = centroid(cells);
    if (middle === undefined) {
      return [];
    }
    const corner = farthestFrom(cells, middle);
    const spots = [
      middle,
      ...(corner === undefined || distance(corner, middle) < 3 ? [] : [corner]),
    ];
    return spots.map((at, index) => spot(`wander-${room}-${String(index + 1)}`, "wander", at));
  });
  return [
    ...elevatorAnchors(map, layout),
    ...receptionAnchors(map, layout),
    ...seats,
    ...fixtureAnchor(map, layout, "coffee", "coffee", ["coffee-machine"], "kitchen"),
    ...fixtureAnchor(map, layout, "restroom", "restroom", ["toilet"], "toilets"),
    ...smoke,
    ...(relax.length > 0 &&
    layout.objects.some((piece) => piece.kind === "lounge-chair" || piece.kind === "hot-tub")
      ? relax
      : relaxSpot === undefined
        ? relax
        : [spot("relax", "relax", relaxSpot)]),
    ...fixtureAnchor(map, layout, "sleep", "sleep", [], "team-room"),
    ...wander,
  ];
}
