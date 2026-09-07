import type { Facing, Point } from "./grid.ts";
import type { Anchor, AnchorKind, FloorTemplate, Furniture } from "./templates.ts";

export type PlanRect = { x: number; y: number; w: number; h: number };
/** Floor materials: corridors/reception, indoor rooms, kitchen and toilets, outdoor decking. Rugs are objects. */
export type Surface = "office" | "room" | "tile" | "wood";
export type PlanRoom = PlanRect & { id: string; label: string; surface: Surface };
/** A placed object with its label and orientation; `sprite` doubles as the delivery key for real art. */
export type PlanObject = Furniture & { id: string; label: string; facing: Facing };
export type PlanDoor = PlanRect & { id: string; kind: "door" | "sliding" | "elevator" };
export type OfficePlan = {
  template: FloorTemplate;
  rooms: PlanRoom[];
  objects: PlanObject[];
  doors: PlanDoor[];
  /** Fixed glazing: impassable like a wall, drawn as tall translucent panels. */
  glass: PlanRect[];
};

/** Which delivered floor tile each surface uses (owner's choices): parquet in the corridors, decking outside. */
export const SURFACE_TILE: Record<Surface, string> = {
  office: "tiles/floor-wood",
  room: "tiles/floor-room",
  tile: "tiles/floor-tile",
  wood: "tiles/floor-deck",
};

export type ObjectOptions = {
  facing?: Facing;
  blocks?: boolean;
  artWidth?: number;
  animation?: string;
  playback?: "loop" | "near" | "sim";
  layer?: "floor" | "objects";
};

/** Art width of a chair in cells (the seat footprint stays 1 × 1; see `Furniture.artWidth`). */
const CHAIR_ART_W = 1.5;

/** Builder for the office plan: rooms, walls, doors, glass, objects, seats and anchors as data. */
export class Plan {
  readonly plan: OfficePlan;

  constructor(id: string, width: number, height: number) {
    this.plan = {
      template: {
        id,
        name: "Office",
        width,
        height,
        floor: Array.from({ length: width * height }, () => SURFACE_TILE.office),
        walls: new Uint8Array(width * height),
        furniture: [],
        anchors: [],
      },
      rooms: [],
      objects: [],
      doors: [],
      glass: [],
    };
  }

  /** Walls on the rectangle's perimeter. */
  wall(rect: PlanRect): void {
    const { walls, width } = this.plan.template;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (
          x === rect.x ||
          x === rect.x + rect.w - 1 ||
          y === rect.y ||
          y === rect.y + rect.h - 1
        ) {
          walls[y * width + x] = 1;
        }
      }
    }
  }

  /** A solid block of wall (the elevator shaft), as opposed to `wall`, which outlines a rect. */
  solid(rect: PlanRect): void {
    const { walls, width } = this.plan.template;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        walls[y * width + x] = 1;
      }
    }
  }

  clear(rect: PlanRect): void {
    const { walls, width } = this.plan.template;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        walls[y * width + x] = 0;
      }
    }
  }

  /** A walled room; `open` rooms only paint their floor (reception, terrace, spa). */
  room(id: string, label: string, rect: PlanRect, surface: Surface = "room", open = false): void {
    this.plan.rooms.push({ id, label, ...rect, surface });
    if (!open) {
      this.wall(rect);
    }
    // A walled room paints its interior; an open area (reception, terrace, spa) is floor to its very edge.
    const inset = open ? 0 : 1;
    const { floor, width } = this.plan.template;
    for (let y = rect.y + inset; y < rect.y + rect.h - inset; y += 1) {
      for (let x = rect.x + inset; x < rect.x + rect.w - inset; x += 1) {
        floor[y * width + x] = SURFACE_TILE[surface];
      }
    }
  }

  door(id: string, rect: PlanRect, kind: PlanDoor["kind"] = "door"): void {
    this.plan.doors.push({ id, ...rect, kind });
    this.clear(rect);
  }

  glass(rect: PlanRect): void {
    this.plan.glass.push(rect);
    this.wall(rect);
  }

  /**
   * A placed object. `facing` is the side the object opens to (default south), `blocks` whether the footprint is
   * impassable (default yes; chairs and wall decor are not), `artWidth` the art width in cells when it is wider
   * than the footprint, `animation` the manifest animation to play (default the single `static` frame).
   */
  object(
    id: string,
    label: string,
    sprite: string,
    rect: PlanRect,
    options: ObjectOptions = {},
  ): void {
    this.plan.objects.push({
      id,
      label,
      sprite: `furniture/${sprite}`,
      animation: options.animation ?? "static",
      at: { x: rect.x, y: rect.y },
      w: rect.w,
      h: rect.h,
      blocks: options.blocks ?? true,
      facing: options.facing ?? "s",
      ...(options.artWidth === undefined ? {} : { artWidth: options.artWidth }),
      ...(options.playback === undefined ? {} : { playback: options.playback }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
    });
  }

  anchor(id: string, kind: AnchorKind, at: Point, facing: Facing = "n", group?: string): void {
    const anchor: Anchor = { id, kind, at, facing, ...(group === undefined ? {} : { group }) };
    this.plan.template.anchors.push(anchor);
  }

  /**
   * A workplace: the desk sprite with its footprint, one chair on `seat` and the desk anchor there. `facing` is
   * where the sitter looks (the chair sprite follows it); footprints are measured from the approved reference.
   */
  seat(
    id: string,
    seat: Point,
    facing: "n" | "s",
    chair: string,
    group?: string,
    kind: "desk" | "boss-desk" = "desk",
  ): void {
    // Chairs in the reference are about 1.5 cells wide around a one-cell seat; the art is centred on it.
    this.object(
      `${id}-chair`,
      "",
      chair,
      { ...seat, w: 1, h: 1 },
      {
        facing,
        blocks: false,
        artWidth: CHAIR_ART_W,
      },
    );
    this.anchor(id, kind, seat, facing, group);
  }
}
