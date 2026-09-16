import { OBJECT_SPEC, type Facing, type LayoutRect, type OfficeLayout } from "@ho/protocol";
import { Grid, type Point } from "./grid.ts";

export const CELL_PX = 24;

type Material = string;

export type TileMap = {
  width: number;
  height: number;
  floor: readonly (Material | null)[];
  wall: readonly (Material | null)[];
  object: readonly (string | null)[];
  room: readonly (string | null)[];
  blocked: Uint8Array;
};

type PlacedObject = LayoutRect & { id: string; kind: string; facing: Facing };

export type AnchorKind =
  | "desk"
  | "boss-desk"
  | "coffee"
  | "restroom"
  | "smoke"
  | "relax"
  | "sleep"
  | "mailbox"
  | "entrance"
  | "reception"
  | "elevator"
  | "car"
  | "wander";

export type Anchor = { id: string; kind: AnchorKind; at: Point; facing: Facing; group?: string };

export type FloorTemplate = {
  id: string;
  name: string;
  map: TileMap;
  objects: readonly PlacedObject[];
  anchors: readonly Anchor[];
};

export function* cellsOf(rect: LayoutRect, width: number, height: number): Generator<number> {
  for (let { y } = rect; y < rect.y + rect.h; y += 1) {
    for (let { x } = rect; x < rect.x + rect.w; x += 1) {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        yield y * width + x;
      }
    }
  }
}

export function* runsOf<T>(
  values: readonly (T | null)[],
  width: number,
  height: number,
): Generator<{ value: T; x: number; y: number; w: number }> {
  for (let y = 0; y < height; y += 1) {
    let start = 0;
    let current: T | null = null;
    for (let x = 0; x <= width; x += 1) {
      const value = x === width ? null : (values[y * width + x] ?? null);
      if (value !== current) {
        if (current !== null) {
          yield { value: current, x: start, y, w: x - start };
        }
        current = value;
        start = x;
      }
    }
  }
}

export function compileLayout(
  floorId: string,
  office: OfficeLayout,
  anchors: readonly Anchor[],
): FloorTemplate {
  const { width, height } = office;
  const cells = width * height;
  const floor: (Material | null)[] = Array.from({ length: cells }, () => "office");
  const wall: (Material | null)[] = Array.from({ length: cells }, () => null);
  const object: (string | null)[] = Array.from({ length: cells }, () => null);
  const room: (string | null)[] = Array.from({ length: cells }, () => null);
  const blocked = new Uint8Array(cells);
  for (const rect of office.walls) {
    for (const i of cellsOf(rect, width, height)) {
      wall[i] = rect.material;
      blocked[i] = 1;
    }
  }
  for (const rect of office.rooms) {
    for (const i of cellsOf(rect, width, height)) {
      room[i] = rect.room;
    }
  }
  const objects: PlacedObject[] = [
    ...office.doors.map((door, i) => ({
      ...door,
      id: `door-${String(i + 1)}`,
      blocks: false,
      opens: true,
    })),
    ...office.objects.map((piece, i) => ({
      ...piece,
      id: `${piece.kind}-${String(i + 1)}`,
      blocks: OBJECT_SPEC[piece.kind].blocks,
      opens: OBJECT_SPEC[piece.kind].walkable,
    })),
  ].map(({ blocks, opens, ...placed }) => {
    for (const i of cellsOf(placed, width, height)) {
      object[i] = placed.id;
      if (blocks) {
        blocked[i] = 1;
      } else if (opens === true) {
        blocked[i] = 0;
      }
    }
    return placed;
  });
  return {
    id: floorId,
    name: office.name,
    map: { width, height, floor, wall, object, room, blocked },
    objects,
    anchors: [...anchors],
  };
}

export function gridFromMap(map: TileMap): Grid {
  const walkable = new Uint8Array(map.width * map.height);
  for (let i = 0; i < walkable.length; i += 1) {
    walkable[i] = map.blocked[i] === 1 ? 0 : 1;
  }
  return new Grid(map.width, map.height, walkable);
}
