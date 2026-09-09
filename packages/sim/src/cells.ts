import { Grid } from "./grid.ts";

/**
 * Pixels per cell at zoom 1. Prison Architect's square tile is the map's atom here too: floors, walls,
 * objects and room designations are all per cell, and a wall is the content of a cell rather than an edge
 * (a 4×4 room therefore needs a 6×6 outline).
 */
export const CELL_PX = 24;

/** Material ids are open strings: layouts are written in code and the view maps unknown ids to a default. */
export type Material = string;

/** One cell of a compiled map. `floor: null` is void — outside the office, and impassable. */
export type Cell = {
  floor: Material | null;
  wall: Material | null;
  /** Id of the object whose footprint covers this cell. */
  object: string | null;
  /** What that object is (`desk`, `door`…): what the view draws and, later, which sprite applies. */
  objectKind: string | null;
  /** Id of the room designated over this cell. */
  room: string | null;
};

/** A compiled layout: one entry per cell in row-major order, plus what movement is not allowed through. */
export type TileMap = {
  width: number;
  height: number;
  floor: readonly (Material | null)[];
  wall: readonly (Material | null)[];
  object: readonly (string | null)[];
  objectKind: readonly (string | null)[];
  room: readonly (string | null)[];
  /** 1 where a cell cannot be walked through: void, a wall, or an object that blocks. */
  blocked: Uint8Array;
};

export const cellIndex = (map: TileMap, x: number, y: number): number => y * map.width + x;

export const cellAt = (map: TileMap, x: number, y: number): Cell => {
  const i = cellIndex(map, x, y);
  return {
    floor: map.floor[i] ?? null,
    wall: map.wall[i] ?? null,
    object: map.object[i] ?? null,
    objectKind: map.objectKind[i] ?? null,
    room: map.room[i] ?? null,
  };
};

/** The collision grid movement uses: everything the map marks as blocked is impassable. */
export function gridFromMap(map: TileMap): Grid {
  const walkable = new Uint8Array(map.width * map.height);
  for (let i = 0; i < walkable.length; i += 1) {
    walkable[i] = map.blocked[i] === 1 ? 0 : 1;
  }
  return new Grid(map.width, map.height, walkable);
}
