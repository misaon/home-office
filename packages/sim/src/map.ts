import { OBJECT_SPEC, type Facing, type LayoutRect, type OfficeLayout } from "@ho/protocol";
import { Grid, type Point } from "./grid.ts";

/**
 * Pixels per cell at zoom 1. Prison Architect's square tile is the map's atom here too: floors, walls,
 * objects and room designations are all per cell, and a wall is the content of a cell rather than an edge
 * (a 4×4 room therefore needs a 6×6 outline).
 */
export const CELL_PX = 24;

/** Material ids are open strings: the view maps unknown ids to a default. */
type Material = string;

/** A compiled office: one entry per cell in row-major order, plus what movement is not allowed through. */
export type TileMap = {
  width: number;
  height: number;
  floor: readonly (Material | null)[];
  wall: readonly (Material | null)[];
  /** Id of the object whose footprint covers this cell. */
  object: readonly (string | null)[];
  /** Id of the room designated over this cell. */
  room: readonly (string | null)[];
  /** 1 where a cell cannot be walked through: void, a wall, or an object that blocks. */
  blocked: Uint8Array;
};

/** A door or a piece of furniture as the office placed it: footprint, kind and the way it faces. */
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

/** A named cell an actor can walk to and use; `group` reserves a spot for one kind (the boss's desk). */
export type Anchor = { id: string; kind: AnchorKind; at: Point; facing: Facing; group?: string };

/** One floor: a compiled office, the objects standing in it and the spots its characters move between. */
export type FloorTemplate = {
  id: string;
  name: string;
  map: TileMap;
  objects: readonly PlacedObject[];
  anchors: readonly Anchor[];
};

/** Every cell index of a rectangle that is still on the map. */
export function* cellsOf(rect: LayoutRect, width: number, height: number): Generator<number> {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        yield y * width + x;
      }
    }
  }
}

/** Runs of equal values in one row, so a rectangle of floor becomes one draw call instead of hundreds. */
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

/**
 * Compiles a drawn office into the map a floor is made of. The whole map is floor; later elements win over
 * earlier ones, so a layout reads top-down: walls around it, the rooms designated over it, then the
 * doors, which open the wall cells they span, and the furniture, which blocks where its spec says so.
 */
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
  // A door opens the wall it cuts through; a piece of furniture never does. Something that hangs on a
  // wall (a window, a picture) leaves it standing, and a lift car is walked into from the room side.
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

/** The collision grid movement uses: everything the map marks as blocked is impassable. */
export function gridFromMap(map: TileMap): Grid {
  const walkable = new Uint8Array(map.width * map.height);
  for (let i = 0; i < walkable.length; i += 1) {
    walkable[i] = map.blocked[i] === 1 ? 0 : 1;
  }
  return new Grid(map.width, map.height, walkable);
}
