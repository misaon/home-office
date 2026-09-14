import { CELL_PX, type FloorTemplate, runsOf, type TileMap } from "@ho/sim";
import { Container, Graphics } from "pixi.js";
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
} from "./colours.ts";
import { roomOutline } from "./room-outline.ts";

const fillRuns = (
  graphics: Graphics,
  values: readonly (string | null)[],
  map: TileMap,
  colour: (value: string) => number,
  alpha = 1,
): void => {
  for (const run of runsOf(values, map.width, map.height)) {
    graphics
      .rect(run.x * CELL_PX, run.y * CELL_PX, run.w * CELL_PX, CELL_PX)
      .fill({ color: colour(run.value), alpha });
  }
};

/** Enough of a gap that abutting pieces never merge, and an outline of the room edges' weight. */
const OBJECT_INSET = CELL_PX * 0.08;
const EDGE_WIDTH = CELL_PX * 0.09;

/** The outline of every room, one cell edge at a time, in each room's own colour. */
const roomEdges = (graphics: Graphics, map: TileMap): void => {
  for (const edge of roomOutline(map)) {
    graphics
      .moveTo(edge.x1 * CELL_PX, edge.y1 * CELL_PX)
      .lineTo(edge.x2 * CELL_PX, edge.y2 * CELL_PX)
      .stroke({
        color: colourOf(ROOM, edge.room, ROOM_DEFAULT),
        alpha: ROOM_EDGE_ALPHA,
        width: EDGE_WIDTH,
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

/**
 * One outlined rectangle per placed object, coloured by what it is. Inset and outlined like a room, so two
 * pieces sharing a cell edge — desks facing each other, a counter along a wall — read as two pieces and not
 * as one; a world-unit hairline would vanish at the zoom the whole floor is seen at.
 */
const objects = (template: FloorTemplate): Graphics => {
  const graphics = new Graphics();
  for (const piece of template.objects) {
    graphics
      .rect(
        piece.x * CELL_PX + OBJECT_INSET,
        piece.y * CELL_PX + OBJECT_INSET,
        piece.w * CELL_PX - OBJECT_INSET * 2,
        piece.h * CELL_PX - OBJECT_INSET * 2,
      )
      .fill(colourOf(OBJECTS, piece.kind, OBJECT_FILL))
      .stroke({ color: OBJECT_EDGE, width: EDGE_WIDTH });
  }
  return graphics;
};

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

/** Everything a floor draws before its characters: ground and floors, then walls and objects. */
export function floorTiles(template: FloorTemplate): Container {
  const root = new Container();
  root.addChild(ground(template.map), walls(template.map), objects(template));
  return root;
}
