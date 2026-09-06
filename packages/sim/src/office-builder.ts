import type { Facing, Point } from "./grid.ts";
import type { Anchor, AnchorKind, FloorTemplate, Furniture } from "./templates.ts";

export type PlanRect = { x: number; y: number; w: number; h: number };
export type Surface = "office" | "tile" | "wood" | "carpet";
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

const SURFACE_TILE: Record<Surface, string> = {
  office: "tiles/floor-office",
  carpet: "tiles/floor-carpet",
  tile: "tiles/floor-tile",
  wood: "tiles/floor-wood",
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

  clear(rect: PlanRect): void {
    const { walls, width } = this.plan.template;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        walls[y * width + x] = 0;
      }
    }
  }

  /** A walled room; `open` rooms only paint their floor (reception, terrace, spa). */
  room(id: string, label: string, rect: PlanRect, surface: Surface = "carpet", open = false): void {
    this.plan.rooms.push({ id, label, ...rect, surface });
    if (!open) {
      this.wall(rect);
    }
    const { floor, width } = this.plan.template;
    for (let y = rect.y + 1; y < rect.y + rect.h - 1; y += 1) {
      for (let x = rect.x + 1; x < rect.x + rect.w - 1; x += 1) {
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

  object(
    id: string,
    label: string,
    sprite: string,
    rect: PlanRect,
    facing: Facing = "s",
    blocks = true,
    artWidth?: number,
  ): void {
    this.plan.objects.push({
      id,
      label,
      sprite: `furniture/${sprite}`,
      animation: "static",
      at: { x: rect.x, y: rect.y },
      w: rect.w,
      h: rect.h,
      blocks,
      facing,
      ...(artWidth === undefined ? {} : { artWidth }),
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
    group?: string,
    kind: "desk" | "boss-desk" = "desk",
  ): void {
    // Chairs in the reference are about 1.5 cells wide around a one-cell seat; the art is centred on it.
    // The boss has an executive chair of its own; everyone else shares chair-n / chair-s.
    this.object(
      `${id}-chair`,
      "",
      kind === "boss-desk" ? "chair-boss" : `chair-${facing}`,
      { ...seat, w: 1, h: 1 },
      facing,
      false,
      CHAIR_ART_W,
    );
    this.anchor(id, kind, seat, facing, group);
  }
}
