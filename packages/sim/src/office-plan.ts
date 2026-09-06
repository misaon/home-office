import type { Facing, Point } from "./grid.ts";
import type { AnchorKind, FloorTemplate, Furniture } from "./templates.ts";

export type PlanRect = { x: number; y: number; w: number; h: number };
export type PlanRoom = PlanRect & {
  id: string;
  label: string;
  surface: "office" | "tile" | "wood";
};
export type PlanObject = Furniture & { id: string; label: string; facing: Facing };
export type PlanDoor = PlanRect & { id: string; kind: "door" | "sliding" | "elevator" };
export type OfficePlan = {
  template: FloorTemplate;
  rooms: PlanRoom[];
  objects: PlanObject[];
  doors: PlanDoor[];
  glass: PlanRect[];
};

/** The approved composition on a navigable grid; art and domain role assignment are separate. */
export function officePlan(): OfficePlan {
  const width = 80;
  const height = 46;
  const plan: OfficePlan = {
    template: {
      id: "office-base-v1",
      name: "Office Base · v1",
      width,
      height,
      floor: Array.from({ length: width * height }, () => "tiles/floor-lobby"),
      walls: new Uint8Array(width * height),
      furniture: [],
      anchors: [],
    },
    rooms: [],
    objects: [],
    doors: [],
    glass: [],
  };
  structure(plan);
  workplaces(plan);
  sharedSpaces(plan);
  plan.template.furniture = plan.objects;
  return plan;
}

function wall(plan: OfficePlan, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1) {
        plan.template.walls[yy * plan.template.width + xx] = 1;
      }
    }
  }
}

function room(
  plan: OfficePlan,
  id: string,
  label: string,
  rect: PlanRect,
  surface: PlanRoom["surface"] = "office",
): void {
  plan.rooms.push({ id, label, ...rect, surface });
  wall(plan, rect.x, rect.y, rect.w, rect.h);
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y += 1) {
    for (let x = rect.x + 1; x < rect.x + rect.w - 1; x += 1) {
      plan.template.floor[y * plan.template.width + x] =
        surface === "tile" ? "tiles/floor-kitchen" : "tiles/floor-carpet";
    }
  }
}

function door(plan: OfficePlan, id: string, rect: PlanRect, kind: PlanDoor["kind"] = "door"): void {
  plan.doors.push({ id, ...rect, kind });
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      plan.template.walls[y * plan.template.width + x] = 0;
    }
  }
}

function object(
  plan: OfficePlan,
  id: string,
  label: string,
  sprite: string,
  rect: PlanRect,
  facing: Facing = "n",
  blocks = true,
): void {
  plan.objects.push({
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

function anchor(
  plan: OfficePlan,
  id: string,
  kind: AnchorKind,
  at: Point,
  facing: Facing = "n",
): void {
  plan.template.anchors.push({ id, kind, at, facing });
}

function structure(p: OfficePlan): void {
  wall(p, 0, 0, 80, 46);
  room(p, "boss", "ŠÉF", { x: 0, y: 0, w: 15, h: 16 });
  room(p, "dev", "VÝVOJÁŘI · 6", { x: 14, y: 0, w: 42, h: 16 });
  room(p, "qa", "QA · 2", { x: 55, y: 0, w: 13, h: 16 });
  room(p, "analyst", "ANALYTICI · 2", { x: 67, y: 0, w: 13, h: 16 });
  room(p, "meeting", "ZASEDAČKA", { x: 33, y: 20, w: 16, h: 14 });
  room(p, "kitchen", "KUCHYŇ / JÍDELNA", { x: 54, y: 20, w: 16, h: 14 }, "tile");
  room(p, "toilets", "TOALETY", { x: 0, y: 33, w: 20, h: 13 }, "tile");
  room(p, "lounge", "RELAX", { x: 19, y: 33, w: 30, h: 13 });
  room(p, "call-1", "CALL 1", { x: 29, y: 20, w: 5, h: 7 });
  room(p, "call-2", "CALL 2", { x: 29, y: 26, w: 5, h: 8 });
  p.rooms.push(
    { id: "reception", label: "RECEPCE", x: 1, y: 20, w: 27, h: 13, surface: "office" },
    { id: "terrace", label: "TERASA", x: 49, y: 34, w: 30, h: 11, surface: "wood" },
    { id: "spa", label: "SPA", x: 70, y: 21, w: 9, h: 13, surface: "wood" },
  );
  // Elevator shaft is physically part of the lobby wall.
  wall(p, 0, 22, 10, 8);
  // Continuous backdrop joins the elevator shaft at x=9; entry stays on the right.
  wall(p, 9, 21, 16, 1);
  wall(p, 1, 35, 5, 6);
  wall(p, 5, 35, 5, 6);
  wall(p, 70, 20, 10, 1);
  door(p, "boss", { x: 10, y: 15, w: 3, h: 1 });
  door(p, "dev", { x: 34, y: 15, w: 4, h: 1 }, "sliding");
  door(p, "qa", { x: 57, y: 15, w: 3, h: 1 });
  door(p, "analyst", { x: 69, y: 15, w: 3, h: 1 });
  door(p, "meeting", { x: 35, y: 20, w: 3, h: 1 });
  door(p, "terrace", { x: 72, y: 20, w: 3, h: 1 });
  door(p, "toilets", { x: 13, y: 33, w: 3, h: 1 });
  door(p, "lounge", { x: 26, y: 33, w: 3, h: 1 });
  door(p, "call-1", { x: 29, y: 23, w: 1, h: 2 });
  door(p, "call-2", { x: 29, y: 29, w: 1, h: 2 });
  door(p, "stall-1", { x: 2, y: 40, w: 2, h: 1 });
  door(p, "stall-2", { x: 6, y: 40, w: 2, h: 1 });
  door(p, "elevator", { x: 3, y: 29, w: 4, h: 1 }, "elevator");
  // The kitchen opens into the corridor on its west side (owner's annotated plan).
  for (let y = 21; y < 33; y += 1) {
    p.template.walls[y * p.template.width + 54] = 0;
  }
  // Fixed glazing spans the corridor too, joining the meeting-room wall at x=48.
  p.glass.push({ x: 49, y: 33, w: 20, h: 1 });
  // Glazing is a solid boundary even when its visual representation is transparent.
  for (const pane of p.glass) {
    wall(p, pane.x, pane.y, pane.w, pane.h);
  }
  anchor(p, "elevator", "elevator", { x: 4, y: 30 });
}

function desk(
  p: OfficePlan,
  id: string,
  label: string,
  x: number,
  y: number,
  facing: Facing,
): void {
  object(p, id, label, "desk-monitor", { x, y, w: 4, h: 2 }, facing);
  const at = { x: x + 1, y: facing === "s" ? y - 1 : y + 2 };
  object(p, `${id}-chair`, "", "chair", { ...at, w: 1, h: 1 }, facing, false);
  anchor(p, id, id === "boss-desk" ? "boss-desk" : "desk", at, facing);
}

function workplaces(p: OfficePlan): void {
  desk(p, "boss-desk", "BOSS", 4, 6, "s");
  for (const [i, x] of [18, 24, 30, 38, 44, 50].entries()) {
    desk(p, `dev-${String(i + 1)}`, `DEV ${String(i + 1)}`, x, 7, "n");
  }
  desk(p, "qa-1", "QA 1", 59, 5, "s");
  desk(p, "qa-2", "QA 2", 59, 8, "n");
  desk(p, "analyst-1", "AN 1", 71, 5, "s");
  desk(p, "analyst-2", "AN 2", 71, 8, "n");
  object(p, "boss-visitors", "HOSTÉ", "sofa", { x: 4, y: 11, w: 5, h: 2 });
  for (const x of [17, 39, 51]) {
    object(p, `shelf-${String(x)}`, "SLOŽKY", "bookshelf", { x, y: 2, w: 3, h: 2 });
  }
}

function sharedSpaces(p: OfficePlan): void {
  object(p, "lift-shaft", "VÝTAH", "elevator", { x: 1, y: 23, w: 8, h: 6 });
  object(p, "reception", "název firmy", "reception", { x: 14, y: 27, w: 8, h: 2 });
  anchor(p, "reception", "reception", { x: 17, y: 30 });
  anchor(p, "reception-staff", "wander", { x: 17, y: 26 }, "s");
  object(p, "meeting-table", "JEDNÁNÍ", "boss-desk", { x: 37, y: 26, w: 7, h: 3 });
  anchor(p, "meeting", "whiteboard", { x: 40, y: 25 }, "s");
  object(p, "kitchen-units", "LINKA", "sink", { x: 56, y: 22, w: 11, h: 2 });
  anchor(p, "coffee", "coffee", { x: 58, y: 24 });
  object(p, "dining", "JÍDELNA", "boss-desk", { x: 59, y: 28, w: 6, h: 2 });
  anchor(p, "dining", "relax", { x: 61, y: 31 });
  for (const x of [2, 6]) {
    object(p, `wc-${String(x)}`, "WC", "toilet", { x, y: 36, w: 2, h: 2 });
    anchor(p, `wc-${String(x)}`, "restroom", { x, y: 38 });
  }
  object(p, "sinks", "UMYVADLA", "sink", { x: 17, y: 37, w: 2, h: 4 });
  anchor(p, "sinks", "wander", { x: 16, y: 39 }, "e");
  object(p, "dryer-bin", "", "trash-bin", { x: 10, y: 36, w: 1, h: 2 });
  object(p, "tv", "TV / PS5", "whiteboard", { x: 20, y: 38, w: 1, h: 4 });
  object(p, "sofa", "POHOVKA", "sofa", { x: 28, y: 38, w: 3, h: 5 });
  anchor(p, "sofa", "relax", { x: 27, y: 40 }, "w");
  object(p, "foosball", "FOTBÁLEK", "boss-desk", { x: 39, y: 38, w: 4, h: 5 });
  anchor(p, "foosball-left", "relax", { x: 38, y: 40 }, "e");
  anchor(p, "foosball-right", "relax", { x: 43, y: 40 }, "w");
  anchor(p, "darts", "relax", { x: 24, y: 37 });
  for (const y of [21, 27]) {
    object(p, `call-desk-${String(y)}`, "", "desk-monitor", { x: 31, y, w: 2, h: 1 });
    anchor(p, `call-${y === 21 ? "1" : "2"}`, "wander", { x: 31, y: y + 2 });
  }
  object(p, "hot-tub", "VÍŘIVKA", "sofa", { x: 72, y: 26, w: 5, h: 6 });
  anchor(p, "hot-tub", "relax", { x: 74, y: 33 });
  object(p, "grill", "GRIL", "coffee-machine", { x: 66, y: 36, w: 3, h: 2 });
  anchor(p, "grill", "coffee", { x: 67, y: 38 });
  object(p, "outdoor-table", "POSEZENÍ", "boss-desk", { x: 54, y: 38, w: 7, h: 4 });
  anchor(p, "terrace-table", "relax", { x: 57, y: 42 });
  object(p, "ashtray", "", "ashtray-stand", { x: 78, y: 23, w: 1, h: 1 });
  anchor(p, "smoke", "smoke", { x: 77, y: 23 }, "e");
}
