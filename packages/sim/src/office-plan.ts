import type { Facing, Point } from "./grid.ts";
import type { Anchor, AnchorKind, FloorTemplate, Furniture } from "./templates.ts";

/** The whole company works on one floor: the owner-approved office (docs/OFFICE-ART.md). */
export const OFFICE_FLOOR_ID = "office";

/**
 * Art density (D20): pixels per cell in every delivered sprite (assets/README.md). The renderer draws the floor
 * at this scale, `bun run assets:import` sizes sprites by it and the manifest records it. Characters are 2 × 2
 * cells, bubbles 1 × 1. 24 sits close to the approved reference (≈21) and near 1:1 on a Retina laptop pane.
 */
export const CELL_PX = 24;

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

const WIDTH = 80;
const HEIGHT = 46;
const SURFACE_TILE: Record<Surface, string> = {
  office: "tiles/floor-office",
  carpet: "tiles/floor-carpet",
  tile: "tiles/floor-tile",
  wood: "tiles/floor-wood",
};

/** Seat zones map to agent roles: developers work at dev desks, reviewers in QA, clerks with the analysts. */
export const SEAT_GROUPS = ["dev", "qa", "analyst"] as const;
export type SeatGroup = (typeof SEAT_GROUPS)[number];

class Plan {
  readonly plan: OfficePlan;

  constructor() {
    this.plan = {
      template: {
        id: OFFICE_FLOOR_ID,
        name: "Office",
        width: WIDTH,
        height: HEIGHT,
        floor: Array.from({ length: WIDTH * HEIGHT }, () => SURFACE_TILE.office),
        walls: new Uint8Array(WIDTH * HEIGHT),
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
    this.object(`${id}-chair`, "", `chair-${facing}`, { ...seat, w: 1, h: 1 }, facing, false);
    this.anchor(id, kind, seat, facing, group);
  }
}

function structure(p: Plan): void {
  p.wall({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  p.room("boss", "ŠÉF", { x: 0, y: 0, w: 15, h: 16 });
  p.room("dev", "VÝVOJÁŘI · 6", { x: 14, y: 0, w: 42, h: 16 });
  p.room("qa", "QA · 2", { x: 55, y: 0, w: 13, h: 16 });
  p.room("analyst", "ANALYTICI · 2", { x: 67, y: 0, w: 13, h: 16 });
  p.room("meeting", "ZASEDAČKA", { x: 33, y: 20, w: 16, h: 14 });
  p.room("kitchen", "KUCHYŇ / JÍDELNA", { x: 48, y: 20, w: 22, h: 14 }, "tile");
  p.room("toilets", "TOALETY", { x: 0, y: 33, w: 20, h: 13 }, "tile");
  p.room("lounge", "RELAX", { x: 19, y: 33, w: 30, h: 13 });
  p.room("call-1", "CALL 1", { x: 29, y: 20, w: 5, h: 7 });
  p.room("call-2", "CALL 2", { x: 29, y: 26, w: 5, h: 8 });
  p.room("reception", "RECEPCE", { x: 9, y: 21, w: 17, h: 12 }, "office", true);
  p.room("terrace", "TERASA", { x: 49, y: 34, w: 30, h: 11 }, "wood", true);
  p.room("spa", "SPA", { x: 70, y: 21, w: 9, h: 13 }, "wood", true);
  // The elevator shaft is part of the lobby wall; the reception backdrop joins it at x=9.
  p.wall({ x: 0, y: 22, w: 10, h: 8 });
  p.wall({ x: 9, y: 21, w: 16, h: 1 });
  // Two WC stalls share the restroom's north wall.
  p.wall({ x: 1, y: 33, w: 5, h: 6 });
  p.wall({ x: 5, y: 33, w: 5, h: 6 });
  p.wall({ x: 70, y: 20, w: 10, h: 1 });
  p.door("boss", { x: 10, y: 15, w: 3, h: 1 });
  p.door("dev", { x: 34, y: 15, w: 4, h: 1 }, "sliding");
  p.door("qa", { x: 57, y: 15, w: 3, h: 1 });
  p.door("analyst", { x: 69, y: 15, w: 3, h: 1 });
  p.door("meeting", { x: 35, y: 20, w: 3, h: 1 });
  p.door("terrace", { x: 72, y: 20, w: 3, h: 1 });
  p.door("toilets", { x: 13, y: 33, w: 3, h: 1 });
  p.door("lounge", { x: 26, y: 33, w: 3, h: 1 });
  p.door("call-1", { x: 29, y: 23, w: 1, h: 2 });
  p.door("call-2", { x: 29, y: 29, w: 1, h: 2 });
  p.door("stall-1", { x: 2, y: 38, w: 2, h: 1 });
  p.door("stall-2", { x: 6, y: 38, w: 2, h: 1 });
  p.door("elevator", { x: 3, y: 29, w: 4, h: 1 }, "elevator");
  // The kitchen absorbs the former corridor strip and keeps its north entrance open.
  p.clear({ x: 49, y: 20, w: 5, h: 1 });
  // Fixed glazing from the meeting-room wall across the kitchen front to the east wall.
  p.glass({ x: 49, y: 33, w: 20, h: 1 });
  // Arrival: the elevator threshold is where everybody (and the postman) enters the office.
  p.anchor("elevator", "elevator", { x: 4, y: 30 });
  p.anchor("entrance", "entrance", { x: 5, y: 30 }, "s");
}

function workplaces(p: Plan): void {
  // Boss: a six-cell desk seen with the monitor's back, the boss sits north of it facing the room.
  p.object("boss-desk", "BOSS", "desk-boss", { x: 3, y: 7, w: 6, h: 3 }, "s");
  p.seat("boss-desk", { x: 6, y: 6 }, "s", undefined, "boss-desk");
  // Developers: two rows of three touching desks (5 × 3 each), the seat south of the desk facing the screen.
  for (const [i, x] of [19, 24, 29, 39, 44, 49].entries()) {
    const id = `dev-${String(i + 1)}`;
    p.object(id, `DEV ${String(i + 1)}`, "desk-n", { x, y: 7, w: 5, h: 3 }, "n");
    p.seat(id, { x: x + 2, y: 10 }, "n", "dev");
  }
  // QA and analysts: one long shared desk per room (5 × 6) with a seat at each end, facing each other.
  for (const [room, x] of [
    ["qa", 60],
    ["analyst", 72],
  ] as const) {
    p.object(
      `${room}-desk`,
      room === "qa" ? "QA · 2" : "AN · 2",
      "desk-pair",
      { x, y: 7, w: 5, h: 6 },
      "s",
    );
    p.seat(`${room}-1`, { x: x + 2, y: 6 }, "s", room);
    p.seat(`${room}-2`, { x: x + 2, y: 13 }, "n", room);
  }
  p.object("boss-visitors", "HOSTÉ", "sofa", { x: 4, y: 11, w: 5, h: 2 });
  p.anchor("boss-visitors", "sleep", { x: 6, y: 13 }, "n");
  for (const x of [17, 39, 51]) {
    p.object(`shelf-${String(x)}`, "SLOŽKY", "bookshelf", { x, y: 2, w: 3, h: 2 });
  }
}

function sharedSpaces(p: Plan): void {
  p.object("lift-shaft", "VÝTAH", "elevator", { x: 1, y: 23, w: 8, h: 6 });
  p.object("reception", "název firmy", "reception-desk", { x: 14, y: 27, w: 8, h: 2 });
  p.anchor("reception", "reception", { x: 17, y: 30 });
  p.anchor("reception-staff", "wander", { x: 17, y: 26 }, "s");
  // The post lands on the reception counter; a courier carries it to the boss.
  p.object("mailbox", "", "mailbox", { x: 22, y: 27, w: 1, h: 1 }, "s", true);
  p.anchor("mailbox", "mailbox", { x: 22, y: 28 }, "n");
  p.object("meeting-table", "JEDNÁNÍ", "meeting-table", { x: 37, y: 26, w: 7, h: 3 });
  p.anchor("meeting", "whiteboard", { x: 40, y: 25 }, "s");
  p.object("kitchen-units", "LINKA", "kitchen-units", { x: 56, y: 22, w: 11, h: 2 });
  p.anchor("coffee", "coffee", { x: 58, y: 24 });
  p.object("dining", "JÍDELNA", "dining-table", { x: 59, y: 28, w: 6, h: 2 });
  p.anchor("dining", "relax", { x: 61, y: 31 });
  for (const x of [2, 6]) {
    p.object(`wc-${String(x)}`, "WC", "toilet", { x, y: 34, w: 2, h: 2 });
    p.anchor(`wc-${String(x)}`, "restroom", { x, y: 36 });
  }
  p.object("sinks", "UMYVADLA", "sinks", { x: 17, y: 37, w: 2, h: 4 }, "w");
  p.anchor("sinks", "wander", { x: 16, y: 39 }, "e");
  p.object("dryer-bin", "", "dryer-bin", { x: 10, y: 36, w: 1, h: 2 });
  p.object("tv", "TV / PS5", "tv", { x: 20, y: 38, w: 1, h: 4 }, "e");
  p.object("sofa", "POHOVKA", "sofa-lounge", { x: 28, y: 38, w: 3, h: 5 }, "w");
  p.anchor("sofa", "relax", { x: 27, y: 40 }, "w");
  p.anchor("sofa-nap", "sleep", { x: 27, y: 41 }, "w");
  p.object("foosball", "FOTBÁLEK", "foosball", { x: 39, y: 38, w: 4, h: 5 });
  p.anchor("foosball-left", "relax", { x: 38, y: 40 }, "e");
  p.anchor("foosball-right", "relax", { x: 43, y: 40 }, "w");
  p.anchor("darts", "relax", { x: 24, y: 37 });
  for (const [i, y] of [21, 27].entries()) {
    p.object(`call-desk-${String(i + 1)}`, "", "call-desk", { x: 31, y, w: 2, h: 1 });
    p.anchor(`call-${String(i + 1)}`, "wander", { x: 31, y: y + 2 });
  }
  p.object("hot-tub", "VÍŘIVKA", "hot-tub", { x: 72, y: 26, w: 5, h: 6 });
  p.anchor("hot-tub", "relax", { x: 74, y: 33 });
  p.object("grill", "GRIL", "grill", { x: 66, y: 36, w: 3, h: 2 });
  p.anchor("grill", "coffee", { x: 67, y: 38 });
  p.object("outdoor-table", "POSEZENÍ", "outdoor-table", { x: 54, y: 38, w: 7, h: 4 });
  p.anchor("terrace-table", "relax", { x: 57, y: 42 });
  p.object("ashtray", "", "ashtray", { x: 78, y: 23, w: 1, h: 1 });
  p.anchor("smoke", "smoke", { x: 77, y: 23 }, "e");
  // Corridor spots for idle wandering.
  for (const [i, at] of [
    { x: 20, y: 18 },
    { x: 45, y: 18 },
    { x: 62, y: 18 },
    { x: 27, y: 30 },
    { x: 40, y: 36 },
  ].entries()) {
    p.anchor(`corridor-${String(i + 1)}`, "wander", at, "s");
  }
}

/** The approved composition on a navigable 80×46 grid, 16 px per cell; art is looked up by object sprite key. */
export function officePlan(): OfficePlan {
  const p = new Plan();
  structure(p);
  workplaces(p);
  sharedSpaces(p);
  p.plan.template.furniture = p.plan.objects;
  return p.plan;
}
