import { CELL_PX, type FloorTemplate, type TileMap } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
import {
  colourOf,
  FLOOR,
  FLOOR_DEFAULT,
  GRID_LINE,
  GROUND,
  OBJECT_EDGE,
  OBJECT_FILL,
  ROOM,
  ROOM_ALPHA,
  ROOM_DEFAULT,
  WALL,
  WALL_DEFAULT,
} from "./palette.ts";

const cell = (x: number, y: number): { x: number; y: number } => ({
  x: x * CELL_PX,
  y: y * CELL_PX,
});

/** Runs of equal values in one row, so a rectangle of floor becomes one draw call instead of hundreds. */
function* runs(
  values: readonly (string | null)[],
  map: TileMap,
): Generator<{ value: string; x: number; y: number; w: number }> {
  for (let y = 0; y < map.height; y += 1) {
    let start = 0;
    let current: string | null = null;
    for (let x = 0; x <= map.width; x += 1) {
      const value = x === map.width ? null : (values[y * map.width + x] ?? null);
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

const fillRuns = (
  graphics: Graphics,
  values: readonly (string | null)[],
  map: TileMap,
  colour: (value: string) => number,
  alpha = 1,
): void => {
  for (const run of runs(values, map)) {
    const at = cell(run.x, run.y);
    graphics.rect(at.x, at.y, run.w * CELL_PX, CELL_PX).fill({ color: colour(run.value), alpha });
  }
};

/** The map's ground and, over it, the floors and room designations a layout declares. */
const ground = (map: TileMap): Graphics => {
  const graphics = new Graphics()
    .rect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
    .fill(GROUND);
  fillRuns(graphics, map.floor, map, (value) => colourOf(FLOOR, value, FLOOR_DEFAULT));
  fillRuns(graphics, map.room, map, (value) => colourOf(ROOM, value, ROOM_DEFAULT), ROOM_ALPHA);
  return graphics;
};

/** Walls fill whole cells, as in Prison Architect, so they are drawn exactly like floors. */
const walls = (map: TileMap): Graphics => {
  const graphics = new Graphics();
  fillRuns(graphics, map.wall, map, (value) => colourOf(WALL, value, WALL_DEFAULT));
  return graphics;
};

/** One outlined rectangle per object footprint. */
const objects = (template: FloorTemplate): Graphics => {
  const graphics = new Graphics();
  const seen = new Set<string>();
  const { map } = template;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const id = map.object[y * map.width + x] ?? null;
      if (id === null || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const box = footprint(map, id, x, y);
      graphics
        .rect(box.x * CELL_PX, box.y * CELL_PX, box.w * CELL_PX, box.h * CELL_PX)
        .fill(OBJECT_FILL)
        .stroke({ color: OBJECT_EDGE, width: 1 });
    }
  }
  return graphics;
};

/** How far an object's own cells reach from where it was first met. */
function footprint(
  map: TileMap,
  id: string,
  fromX: number,
  fromY: number,
): { x: number; y: number; w: number; h: number } {
  let w = 0;
  let h = 0;
  while (fromX + w < map.width && map.object[fromY * map.width + fromX + w] === id) {
    w += 1;
  }
  while (fromY + h < map.height && map.object[(fromY + h) * map.width + fromX] === id) {
    h += 1;
  }
  return { x: fromX, y: fromY, w, h };
}

/** The grid itself: one hairline on every cell boundary, the map's outer edge included. */
export function gridLines(map: TileMap, scale: number): Graphics {
  const graphics = new Graphics();
  const width = map.width * CELL_PX;
  const height = map.height * CELL_PX;
  for (let x = 0; x <= map.width; x += 1) {
    graphics.moveTo(x * CELL_PX, 0).lineTo(x * CELL_PX, height);
  }
  for (let y = 0; y <= map.height; y += 1) {
    graphics.moveTo(0, y * CELL_PX).lineTo(width, y * CELL_PX);
  }
  return graphics.stroke({ color: GRID_LINE, width: 1 / scale });
}

/** Everything a floor draws before its characters: ground and floors, the grid, then walls and objects. */
export function floorTiles(template: FloorTemplate): Container {
  const root = new Container();
  root.addChild(ground(template.map), walls(template.map), objects(template));
  return root;
}
