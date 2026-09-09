import { OBJECT_BLOCKS, type OfficeLayout } from "@ho/protocol";
import type { Material, TileMap } from "./cells.ts";
import type { Facing, Point } from "./grid.ts";
import type { Anchor, FloorTemplate } from "./templates.ts";

/** A rectangle of cells, `at` its top-left corner. A one-cell-wide rectangle is a line. */
export type Rect = { at: Point; w: number; h: number };

/** An object standing on the map: its footprint in cells, which way it faces and whether it blocks. */
export type LayoutObject = Rect & {
  id: string;
  kind: string;
  facing: Facing;
  blocks: boolean;
};

/**
 * An office written in code. Later rectangles win over earlier ones, so a layout reads top-down: the
 * ground it stands on, the walls around it, the rooms designated over it and the objects placed in it.
 * An object that does not block clears the cells it covers — that is what makes a door a door.
 */
export type Layout = {
  id: string;
  name: string;
  width: number;
  height: number;
  floors: readonly (Rect & { material: Material })[];
  walls: readonly (Rect & { material: Material })[];
  rooms: readonly (Rect & { room: string })[];
  objects: readonly LayoutObject[];
  anchors: readonly Anchor[];
};

/**
 * A drawn office as the compiler's input: the whole map is floor, walls and rooms map across, and every
 * door becomes a non-blocking object on its wall cell — which is what makes that cell passable.
 */
export const layoutFromOffice = (office: OfficeLayout): Layout => ({
  id: office.id,
  name: office.name,
  width: office.width,
  height: office.height,
  floors: [{ at: { x: 0, y: 0 }, w: office.width, h: office.height, material: "office" }],
  walls: office.walls.map((r) => ({
    at: { x: r.x, y: r.y },
    w: r.w,
    h: r.h,
    material: r.material,
  })),
  rooms: office.rooms.map((r) => ({ at: { x: r.x, y: r.y }, w: r.w, h: r.h, room: r.room })),
  objects: [
    ...office.doors.map((door, i) => ({
      id: `door-${String(i + 1)}`,
      kind: door.kind,
      at: { x: door.x, y: door.y },
      w: door.w,
      h: door.h,
      facing: "s" as const,
      blocks: false,
    })),
    ...office.objects.map((object, i) => ({
      id: `${object.kind}-${String(i + 1)}`,
      kind: object.kind,
      at: { x: object.x, y: object.y },
      w: object.w,
      h: object.h,
      facing: "s" as const,
      blocks: OBJECT_BLOCKS[object.kind],
    })),
  ],
  anchors: [],
});

type Layers = {
  floor: (Material | null)[];
  wall: (Material | null)[];
  object: (string | null)[];
  objectKind: (string | null)[];
  room: (string | null)[];
  blocked: Uint8Array;
};

const layers = (cells: number): Layers => ({
  floor: Array.from({ length: cells }, () => null),
  wall: Array.from({ length: cells }, () => null),
  object: Array.from({ length: cells }, () => null),
  objectKind: Array.from({ length: cells }, () => null),
  room: Array.from({ length: cells }, () => null),
  blocked: new Uint8Array(cells).fill(1),
});

/** Every cell of a rectangle that is still on the map. */
function* cellsOf(rect: Rect, width: number, height: number): Generator<number> {
  for (let y = rect.at.y; y < rect.at.y + rect.h; y += 1) {
    for (let x = rect.at.x; x < rect.at.x + rect.w; x += 1) {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        yield y * width + x;
      }
    }
  }
}

/** Compiles an authored layout into the map a floor is made of. Pure: the same layout gives the same map. */
export function compileLayout(floorId: string, layout: Layout): FloorTemplate {
  const { width, height } = layout;
  const cells = layers(width * height);
  for (const rect of layout.floors) {
    for (const i of cellsOf(rect, width, height)) {
      cells.floor[i] = rect.material;
      cells.blocked[i] = 0;
    }
  }
  for (const rect of layout.walls) {
    for (const i of cellsOf(rect, width, height)) {
      cells.wall[i] = rect.material;
      cells.blocked[i] = 1;
    }
  }
  for (const rect of layout.rooms) {
    for (const i of cellsOf(rect, width, height)) {
      cells.room[i] = rect.room;
    }
  }
  for (const object of layout.objects) {
    for (const i of cellsOf(object, width, height)) {
      cells.object[i] = object.id;
      cells.objectKind[i] = object.kind;
      cells.blocked[i] = object.blocks ? 1 : 0;
    }
  }
  const map: TileMap = { width, height, ...cells };
  return { id: floorId, name: layout.name, map, anchors: [...layout.anchors] };
}
