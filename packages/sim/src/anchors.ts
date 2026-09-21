import type { Facing, OfficeLayout, RoomKind } from "@ho/protocol";
import { facingTowards, type Grid, type Point } from "./grid.ts";
import { type Anchor, type AnchorKind, gridFromMap, type TileMap } from "./map.ts";

export const RECEPTION_ANCHOR = "reception-staff";

type Rect = { x: number; y: number; w: number; h: number };
type Placed = OfficeLayout["objects"][number];

const OPPOSITE: Readonly<Record<Facing, Facing>> = { n: "s", s: "n", e: "w", w: "e" };

const DESK_GROUP: Readonly<Record<string, string>> = {
  "desk-developer": "dev",
  "desk-qa": "qa",
  "desk-analyst": "analyst",
};

const frontOf = (rect: Rect, facing: Facing, distance: number): Point => {
  const middleX = rect.x + Math.floor(rect.w / 2);
  const middleY = rect.y + Math.floor(rect.h / 2);
  const front: Readonly<Record<Facing, Point>> = {
    n: { x: middleX, y: rect.y - distance },
    s: { x: middleX, y: rect.y + rect.h + distance },
    w: { x: rect.x - distance, y: middleY },
    e: { x: rect.x + rect.w + distance, y: middleY },
  };
  return front[facing];
};

const roomOfCell = (map: TileMap, x: number, y: number): string | null =>
  x < 0 || y < 0 || x >= map.width || y >= map.height
    ? null
    : (map.room[y * map.width + x] ?? null);

const roomVertices = (map: TileMap, grid: Grid, room: RoomKind): Point[] => {
  const vertices: Point[] = [];
  for (let y = 1; y < map.height; y += 1) {
    for (let x = 1; x < map.width; x += 1) {
      const at = { x, y };
      if (
        grid.isWalkable(at) &&
        roomOfCell(map, x - 1, y - 1) === room &&
        roomOfCell(map, x, y - 1) === room &&
        roomOfCell(map, x - 1, y) === room &&
        roomOfCell(map, x, y) === room
      ) {
        vertices.push(at);
      }
    }
  }
  return vertices;
};

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const nearestTo = (points: readonly Point[], target: Point): Point | undefined =>
  points.toSorted((a, b) => distance(a, target) - distance(b, target))[0];

const farthestFrom = (points: readonly Point[], target: Point): Point | undefined =>
  points.toSorted((a, b) => distance(b, target) - distance(a, target))[0];

const centroid = (points: readonly Point[]): Point | undefined => {
  if (points.length === 0) {
    return undefined;
  }
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return nearestTo(points, { x: sum.x / points.length, y: sum.y / points.length });
};

const spot = (
  id: string,
  kind: AnchorKind,
  at: Point,
  facing: Facing = "s",
  group?: string,
): Anchor => (group === undefined ? { id, kind, at, facing } : { id, kind, at, facing, group });

const seatOf = (grid: Grid, piece: Placed, index: number): Anchor | null => {
  const group = piece.kind === "desk-boss" ? "boss" : DESK_GROUP[piece.kind];
  if (group === undefined) {
    return null;
  }
  const at = frontOf(piece, piece.facing, 1);
  if (!grid.isWalkable(at)) {
    return null;
  }
  const kind: AnchorKind = piece.kind === "desk-boss" ? "boss-desk" : "desk";
  return spot(`${kind}-${String(index + 1)}`, kind, at, OPPOSITE[piece.facing], group);
};

const elevatorAnchors = (grid: Grid, layout: OfficeLayout): Anchor[] => {
  const lift = layout.objects.find((piece) => piece.kind === "elevator");
  if (lift === undefined) {
    return [];
  }
  const car = { x: lift.x + Math.floor(lift.w / 2), y: lift.y + Math.floor(lift.h / 2) };
  const door = frontOf(lift, lift.facing, 0);
  const entrance = frontOf(lift, lift.facing, 1);
  return [
    spot("car", "car", car, lift.facing),
    ...(grid.isWalkable(door) ? [spot("elevator", "elevator", door, lift.facing)] : []),
    ...(grid.isWalkable(entrance) ? [spot("entrance", "entrance", entrance, lift.facing)] : []),
  ];
};

const receptionAnchors = (map: TileMap, grid: Grid, layout: OfficeLayout): Anchor[] => {
  const counter = layout.objects.find((piece) => piece.kind === "reception-counter");
  if (counter !== undefined) {
    const behind = frontOf(counter, OPPOSITE[counter.facing], 1);
    const aside = { x: counter.x - 1, y: counter.y + Math.floor(counter.h / 2) };
    return [
      ...(grid.isWalkable(behind)
        ? [spot(RECEPTION_ANCHOR, "reception", behind, counter.facing)]
        : []),
      ...(grid.isWalkable(aside) ? [spot("mailbox", "mailbox", aside, counter.facing)] : []),
    ];
  }
  const vertices = roomVertices(map, grid, "reception");
  const middle = centroid(vertices);
  if (middle === undefined) {
    return [];
  }
  const corner = nearestTo(vertices, { x: 0, y: 0 });
  return [
    spot(RECEPTION_ANCHOR, "reception", middle, "w"),
    ...(corner === undefined || (corner.x === middle.x && corner.y === middle.y)
      ? []
      : [spot("mailbox", "mailbox", corner, "n")]),
  ];
};

const fixtureAnchor = (
  map: TileMap,
  grid: Grid,
  layout: OfficeLayout,
  id: string,
  kind: AnchorKind,
  pieces: readonly Placed["kind"][],
  room: RoomKind,
): Anchor[] => {
  const piece = layout.objects.find((candidate) => pieces.includes(candidate.kind));
  if (piece !== undefined) {
    const at = frontOf(piece, piece.facing, 1);
    return grid.isWalkable(at) ? [spot(id, kind, at, OPPOSITE[piece.facing])] : [];
  }
  const middle = centroid(roomVertices(map, grid, room));
  return middle === undefined ? [] : [spot(id, kind, middle)];
};

const WANDER_ROOMS: readonly RoomKind[] = ["terrace", "team-room", "kitchen"];
const MEETING_RING = 2;
const MEETING_SPOTS = 8;

const angleAround = (centre: Point, at: Point): number =>
  Math.atan2(at.y - centre.y, at.x - centre.x);

const meetingAnchors = (map: TileMap, grid: Grid): Anchor[] => {
  const vertices = roomVertices(map, grid, "meeting");
  const centre = centroid(vertices);
  if (centre === undefined) {
    return [];
  }
  const ring = vertices
    .filter((at) => Math.max(Math.abs(at.x - centre.x), Math.abs(at.y - centre.y)) === MEETING_RING)
    .toSorted((a, b) => angleAround(centre, a) - angleAround(centre, b));
  const every = Math.max(1, Math.floor(ring.length / MEETING_SPOTS));
  return ring
    .filter((_, index) => index % every === 0)
    .slice(0, MEETING_SPOTS)
    .map((at, index) =>
      spot(`meeting-${String(index + 1)}`, "meeting", at, facingTowards(at, centre)),
    );
};

const wanderAnchors = (map: TileMap, grid: Grid): Anchor[] =>
  WANDER_ROOMS.flatMap((room) => {
    const vertices = roomVertices(map, grid, room);
    const middle = centroid(vertices);
    if (middle === undefined) {
      return [];
    }
    const corner = farthestFrom(vertices, middle);
    const spots = [
      middle,
      ...(corner === undefined || distance(corner, middle) < 3 ? [] : [corner]),
    ];
    return spots.map((at, index) => spot(`wander-${room}-${String(index + 1)}`, "wander", at));
  });

export function anchorsOf(map: TileMap, layout: OfficeLayout): Anchor[] {
  const grid = gridFromMap(map);
  const seats = layout.objects
    .map((piece, index) => seatOf(grid, piece, index))
    .filter((anchor): anchor is Anchor => anchor !== null);
  const smoke = fixtureAnchor(map, grid, layout, "smoke", "smoke", ["standing-ashtray"], "terrace");
  const terrace = roomVertices(map, grid, "terrace");
  const smokeSpot = smoke[0]?.at;
  const relaxSpot = smokeSpot === undefined ? centroid(terrace) : farthestFrom(terrace, smokeSpot);
  const relax = fixtureAnchor(
    map,
    grid,
    layout,
    "relax",
    "relax",
    ["lounge-chair", "hot-tub"],
    "team-room",
  );
  const furnished = layout.objects.some(
    (piece) => piece.kind === "lounge-chair" || piece.kind === "hot-tub",
  );
  return [
    ...elevatorAnchors(grid, layout),
    ...receptionAnchors(map, grid, layout),
    ...seats,
    ...fixtureAnchor(map, grid, layout, "coffee", "coffee", ["coffee-machine"], "kitchen"),
    ...fixtureAnchor(map, grid, layout, "restroom", "restroom", ["toilet"], "toilets"),
    ...smoke,
    ...(relax.length > 0 && furnished
      ? relax
      : relaxSpot === undefined
        ? relax
        : [spot("relax", "relax", relaxSpot)]),
    ...fixtureAnchor(map, grid, layout, "sleep", "sleep", [], "team-room"),
    ...meetingAnchors(map, grid),
    ...wanderAnchors(map, grid),
  ];
}
