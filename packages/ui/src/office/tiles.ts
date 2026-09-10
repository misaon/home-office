import { CELL_PX, type FloorTemplate, type TileMap } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
import { roomOutline } from "./room-outline.ts";
import {
  colourOf,
  FLOOR,
  FLOOR_DEFAULT,
  GRID_LINE,
  GROUND,
  OBJECT_EDGE,
  OBJECT_FILL,
  OBJECTS,
  ROOM,
  ROOM_ALPHA,
  ROOM_DEFAULT,
  ROOM_EDGE_ALPHA,
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

/** The outline of every room, one cell edge at a time, in each room's own colour. */
const roomEdges = (graphics: Graphics, map: TileMap): void => {
  const width = CELL_PX * 0.09;
  for (const edge of roomOutline(map)) {
    graphics
      .moveTo(edge.x1 * CELL_PX, edge.y1 * CELL_PX)
      .lineTo(edge.x2 * CELL_PX, edge.y2 * CELL_PX)
      .stroke({
        color: colourOf(ROOM, edge.room, ROOM_DEFAULT),
        alpha: ROOM_EDGE_ALPHA,
        width,
      });
  }
};

/** The map's ground and, over it, the floors and room designations a layout declares. */
const ground = (map: TileMap): Graphics => {
  const graphics = new Graphics()
    .rect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
    .fill(GROUND);
  fillRuns(graphics, map.floor, map, (value) => colourOf(FLOOR, value, FLOOR_DEFAULT));
  fillRuns(graphics, map.room, map, (value) => colourOf(ROOM, value, ROOM_DEFAULT), ROOM_ALPHA);
  roomEdges(graphics, map);
  return graphics;
};

/** Walls fill whole cells, as in Prison Architect, so they are drawn exactly like floors. */
const walls = (map: TileMap): Graphics => {
  const graphics = new Graphics();
  fillRuns(graphics, map.wall, map, (value) => colourOf(WALL, value, WALL_DEFAULT));
  return graphics;
};

/** Enough of a gap that abutting pieces never merge, and an outline of the room edges' weight. */
const OBJECT_INSET = CELL_PX * 0.08;
const OBJECT_EDGE_WIDTH = CELL_PX * 0.09;

/** One outlined rectangle per object footprint, coloured by what the object is. */
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
      const kind = map.objectKind[y * map.width + x] ?? "";
      // Inset and outlined like a room, so two pieces sharing a cell edge — desks facing each other,
      // a counter along a wall — read as two pieces and not as one. A world-unit hairline would
      // vanish at the zoom the whole floor is seen at.
      graphics
        .rect(
          box.x * CELL_PX + OBJECT_INSET,
          box.y * CELL_PX + OBJECT_INSET,
          box.w * CELL_PX - OBJECT_INSET * 2,
          box.h * CELL_PX - OBJECT_INSET * 2,
        )
        .fill(colourOf(OBJECTS, kind, OBJECT_FILL))
        .stroke({ color: OBJECT_EDGE, width: OBJECT_EDGE_WIDTH });
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
