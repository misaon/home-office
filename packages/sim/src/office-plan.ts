import { type OfficePlan, Plan } from "./office-builder.ts";
import { decor } from "./office-decor.ts";

/** The whole company works on one floor: the owner-approved office (docs/OFFICE-ART.md). */
export const OFFICE_FLOOR_ID = "office";

/**
 * Art density (D20): pixels per cell in every delivered sprite (assets/README.md). The renderer draws the floor
 * at this scale, `bun run assets:import` sizes sprites by it and the manifest records it. Characters are 2 cells
 * wide and 5 tall (D21), bubbles 1 × 1. 24 sits close to the approved reference (≈21) and near 1:1 on a Retina
 * laptop pane.
 */
export const CELL_PX = 24;

const WIDTH = 80;
const HEIGHT = 46;

/** Seat zones map to agent roles: developers work at dev desks, reviewers in QA, clerks with the analysts. */
export const SEAT_GROUPS = ["dev", "qa", "analyst"] as const;
export type SeatGroup = (typeof SEAT_GROUPS)[number];

/*
 * Every footprint below was measured on the approved reference (1660 × 948 px = 80 × 46 cells of 20.75 px) and
 * snapped to whole cells: the footprint is the object's floor contact, the art may rise above it. Seats sit
 * where the reference draws the chair (a cell or two south of the desk); a sitter facing south is drawn one
 * cell lower by the renderer so the desk hides their legs.
 */

function structure(p: Plan): void {
  p.wall({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  p.room("boss", "ŠÉF", { x: 0, y: 0, w: 15, h: 16 });
  p.room("dev", "VÝVOJÁŘI · 6", { x: 14, y: 0, w: 42, h: 16 });
  p.room("qa", "QA · 2", { x: 55, y: 0, w: 13, h: 16 });
  p.room("analyst", "ANALYTICI · 2", { x: 67, y: 0, w: 13, h: 16 });
  p.room("meeting", "ZASEDAČKA", { x: 33, y: 20, w: 16, h: 14 });
  p.room("kitchen", "KUCHYŇ / JÍDELNA", { x: 48, y: 20, w: 22, h: 14 }, "tile");
  p.room("toilets", "TOALETY", { x: 0, y: 33, w: 21, h: 13 }, "tile");
  p.room("lounge", "RELAX", { x: 20, y: 33, w: 29, h: 13 });
  p.room("call-1", "CALL 1", { x: 29, y: 20, w: 5, h: 7 });
  p.room("call-2", "CALL 2", { x: 29, y: 26, w: 5, h: 8 });
  p.room("reception", "RECEPCE", { x: 9, y: 21, w: 17, h: 12 }, "office", true);
  p.room("terrace", "TERASA", { x: 49, y: 34, w: 30, h: 11 }, "wood", true);
  p.room("spa", "SPA", { x: 70, y: 21, w: 9, h: 13 }, "wood", true);
  // The elevator shaft is a solid block of the lobby wall; the reception backdrop joins it at x=9. The car's
  // interior is walkable so passengers stand inside it and step out through the doors.
  p.solid({ x: 0, y: 22, w: 10, h: 8 });
  p.clear({ x: 4, y: 25, w: 4, h: 4 });
  p.wall({ x: 9, y: 21, w: 16, h: 1 });
  // Two WC stalls (walls at x 1, 5 and 10 in the reference) share the restroom's north wall.
  p.wall({ x: 1, y: 33, w: 5, h: 6 });
  p.wall({ x: 5, y: 33, w: 6, h: 6 });
  p.wall({ x: 70, y: 20, w: 10, h: 1 });
  // Door openings as painted: hinges and leaves measured, widths are the actual gaps in the wall.
  p.door("boss", { x: 12, y: 15, w: 2, h: 1 });
  p.door("dev", { x: 33, y: 15, w: 6, h: 1 }, "sliding");
  p.door("qa", { x: 56, y: 15, w: 2, h: 1 });
  p.door("analyst", { x: 68, y: 15, w: 2, h: 1 });
  p.door("meeting", { x: 35, y: 20, w: 3, h: 1 });
  p.door("spa", { x: 70, y: 20, w: 5, h: 1 });
  p.door("toilets", { x: 13, y: 33, w: 3, h: 1 });
  p.door("lounge", { x: 26, y: 33, w: 3, h: 1 });
  p.door("call-1", { x: 29, y: 23, w: 1, h: 2 });
  p.door("call-2", { x: 29, y: 29, w: 1, h: 2 });
  p.door("stall-1", { x: 2, y: 38, w: 2, h: 1 });
  p.door("stall-2", { x: 6, y: 38, w: 2, h: 1 });
  p.door("elevator", { x: 3, y: 29, w: 6, h: 1 }, "elevator");
  // The kitchen absorbs the former corridor strip and keeps its north entrance open.
  p.clear({ x: 49, y: 20, w: 5, h: 1 });
  // Fixed glazing from the meeting-room wall across the kitchen front to the east wall.
  p.glass({ x: 49, y: 33, w: 20, h: 1 });
  // The terrace is fenced by a low glass rail along its south and east edges instead of the outer wall.
  p.glass({ x: 49, y: 45, w: 30, h: 1 }, "rail");
  p.glass({ x: 79, y: 34, w: 1, h: 12 }, "rail");
  // Arrival: the elevator threshold is where everybody (and the postman) enters the office.
  p.anchor("elevator", "elevator", { x: 4, y: 30 });
  p.anchor("entrance", "entrance", { x: 5, y: 30 }, "s");
  p.anchor("car", "car", { x: 5, y: 26 }, "s");
}

function workplaces(p: Plan): void {
  // Sprite keys are the delivery file names. "-rotated" art shows a desk's front panel and the monitors' backs:
  // its sitter is north of the desk, facing the room; plain desk art shows drawers and screens, its sitter south.
  // Boss: behind a six-cell desk, facing the room; two armchairs and a round table for visitors.
  p.object("boss-desk", "BOSS", "desk-boss-rotated", { x: 3, y: 7, w: 6, h: 3 });
  p.seat("boss-desk", { x: 6, y: 6 }, "s", "chair-boss", undefined, "boss-desk");
  p.object("boss-visitors", "HOSTÉ", "boss-visitors", { x: 3, y: 11, w: 7, h: 3 });
  p.anchor("boss-visitors", "sleep", { x: 6, y: 14 }, "n");
  // Developers: two rows of three touching desks (5 × 3), the chair right against the desk's front edge.
  for (const [i, x] of [19, 24, 29, 39, 44, 49].entries()) {
    const id = `dev-${String(i + 1)}`;
    p.object(
      id,
      `DEV ${String(i + 1)}`,
      "desk-developer",
      { x, y: 7, w: 5, h: 3 },
      { facing: "n" },
    );
    p.seat(id, { x: x + 2, y: 11 }, "n", "chair-developer", "dev");
  }
  p.object("shelf-left", "SLOŽKY", "bookshelf", { x: 17, y: 3, w: 4, h: 3 });
  p.object("copier", "KOPÍRKA", "copier", { x: 42, y: 3, w: 3, h: 3 });
  p.object("shelf-right", "SLOŽKY", "bookshelf", { x: 50, y: 3, w: 4, h: 3 });
  // QA and analysts: two desks back to back per room form the reference's long shared desk — the north one
  // rotated (its sitter faces south), the south one plain (its sitter faces north, chair by the wall).
  for (const [room, label, x] of [
    ["qa", "QA", 60],
    ["analyst", "AN", 72],
  ] as const) {
    p.object(`${room}-desk-1`, `${label} 1`, `desk-${room}-rotated`, { x, y: 7, w: 5, h: 3 });
    p.seat(`${room}-1`, { x: x + 2, y: 6 }, "s", `chair-${room}-rotated`, room);
    p.object(
      `${room}-desk-2`,
      `${label} 2`,
      `desk-${room}`,
      { x, y: 10, w: 5, h: 3 },
      { facing: "n" },
    );
    p.seat(`${room}-2`, { x: x + 2, y: 13 }, "n", `chair-${room}`, room);
  }
}

function sharedSpaces(p: Plan): void {
  // The elevator is three layers on one footprint: the static cabin under the passengers (floor layer), the
  // doors above them (driven by the simulation's elevator state) and the front frame on top.
  p.object(
    "elevator-cabin",
    "VÝTAH",
    "elevator-cabin",
    { x: 3, y: 23, w: 7, h: 6 },
    { blocks: false, layer: "floor" },
  );
  p.object(
    "elevator-doors",
    "",
    "elevator-doors",
    { x: 3, y: 23, w: 7, h: 6 },
    { blocks: false, animation: "open", playback: "sim" },
  );
  p.object("elevator-frame", "", "elevator-frame", { x: 3, y: 23, w: 7, h: 6 }, { blocks: false });
  // The reception counter is drawn frontally (four cells tall); the receptionist stands behind it.
  p.object("reception", "název firmy", "desk-reception-rotated", { x: 14, y: 26, w: 8, h: 4 });
  p.anchor("reception", "reception", { x: 17, y: 30 });
  p.anchor("reception-staff", "wander", { x: 17, y: 25 }, "s");
  // The post lands beside the reception counter; a courier carries it to the boss.
  p.object("mailbox", "", "mailbox", { x: 22, y: 27, w: 1, h: 1 });
  p.anchor("mailbox", "mailbox", { x: 22, y: 28 }, "n");
  // Meeting: an eight-cell table with three chairs on each long side, the screen on the north wall.
  p.object("meeting-table", "JEDNÁNÍ", "meeting-table", { x: 36, y: 25, w: 8, h: 3 });
  for (const [i, x] of [36, 39, 41].entries()) {
    p.object(
      `meeting-chair-n${String(i)}`,
      "",
      "meeting-chair",
      { x, y: 24, w: 2, h: 1 },
      { blocks: false },
    );
    p.object(
      `meeting-chair-s${String(i)}`,
      "",
      "meeting-chair",
      { x, y: 29, w: 2, h: 1 },
      { facing: "n", blocks: false },
    );
  }
  p.anchor("meeting", "whiteboard", { x: 40, y: 23 });
  // Kitchen: counter with the coffee machine, the fridge at its east end, dining table with six chairs.
  p.object("kitchen-units", "LINKA", "kitchen-units", { x: 55, y: 23, w: 8, h: 3 });
  p.object("fridge", "", "fridge", { x: 63, y: 23, w: 3, h: 3 });
  p.anchor("coffee", "coffee", { x: 54, y: 24 }, "e");
  p.object("dining", "JÍDELNA", "dining-table", { x: 55, y: 28, w: 8, h: 2 });
  for (const [i, x] of [55, 58, 60].entries()) {
    p.object(
      `dining-chair-n${String(i)}`,
      "",
      "dining-chair",
      { x, y: 27, w: 2, h: 1 },
      { blocks: false },
    );
    p.object(
      `dining-chair-s${String(i)}`,
      "",
      "dining-chair",
      { x, y: 31, w: 2, h: 1 },
      { facing: "n", blocks: false },
    );
  }
  p.anchor("dining", "relax", { x: 58, y: 31 });
  // Toilets: two stalls, the sinks with a mirror, the hand dryer and bin on the stall wall.
  for (const [i, x] of [3, 7].entries()) {
    p.object(`wc-${String(i + 1)}`, "WC", "toilet", { x, y: 35, w: 2, h: 3 }, { facing: "e" });
    p.anchor(`wc-${String(i + 1)}`, "restroom", { x: x - 1, y: 36 }, "e");
  }
  p.object("sinks", "UMYVADLA", "sinks", { x: 17, y: 38, w: 2, h: 4 }, { facing: "w" });
  p.anchor("sinks", "wander", { x: 16, y: 39 }, "e");
  p.object("dryer-bin", "", "dryer-bin", { x: 11, y: 40, w: 1, h: 4 });
  // Lounge: TV and console by the west wall, an L-shaped sofa around a coffee table, darts, foosball.
  p.object("tv", "TV", "tv", { x: 21, y: 36, w: 1, h: 6 }, { facing: "e", artWidth: 1.5 });
  p.object(
    "lounge-console",
    "PS5",
    "lounge-console",
    { x: 21, y: 42, w: 2, h: 2 },
    { facing: "e" },
  );
  p.object("lounge-sofa", "POHOVKA", "lounge-sofa", { x: 30, y: 36, w: 3, h: 9 }, { facing: "w" });
  p.object("lounge-sofa-end", "", "lounge-sofa-end", { x: 27, y: 42, w: 3, h: 3 });
  p.object("lounge-table", "", "lounge-table", { x: 27, y: 39, w: 2, h: 3 });
  p.anchor("sofa", "relax", { x: 29, y: 39 }, "e");
  p.anchor("sofa-nap", "sleep", { x: 29, y: 41 }, "s");
  p.object("dartboard", "", "dartboard", { x: 24, y: 35, w: 2, h: 2 }, { blocks: false });
  p.anchor("darts", "relax", { x: 25, y: 38 });
  p.object("foosball", "FOTBÁLEK", "foosball", { x: 39, y: 37, w: 4, h: 6 });
  p.anchor("foosball-left", "relax", { x: 38, y: 40 }, "e");
  p.anchor("foosball-right", "relax", { x: 43, y: 40 }, "w");
  // Call booths: a small table with a plant, the stool south of it.
  for (const [i, y] of [23, 29].entries()) {
    p.object(`call-desk-${String(i + 1)}`, "", "call-desk", { x: 31, y, w: 2, h: 1 });
    p.anchor(`call-${String(i + 1)}`, "wander", { x: 31, y: y + 2 });
  }
}

function outdoors(p: Plan): void {
  // Spa: the tub bubbles in a loop; a bench below it, the ashtray by the door.
  p.object("hot-tub", "VÍŘIVKA", "spa", { x: 72, y: 26, w: 5, h: 6 }, { animation: "bubbles" });
  p.object("spa-bench", "", "spa-bench", { x: 74, y: 32, w: 2, h: 2 });
  p.anchor("hot-tub", "relax", { x: 71, y: 29 }, "e");
  p.object("ashtray", "", "ashtray", { x: 78, y: 24, w: 1, h: 1 });
  p.anchor("smoke", "smoke", { x: 77, y: 24 }, "e");
  // Terrace: grill with its side table, the long table with six chairs, a round table and a sofa.
  p.object("grill", "GRIL", "grill", { x: 66, y: 37, w: 4, h: 4 });
  p.object("grill-table", "", "grill-table", { x: 70, y: 38, w: 2, h: 3 });
  p.anchor("grill", "coffee", { x: 68, y: 41 });
  p.object("outdoor-table", "POSEZENÍ", "outdoor-table", { x: 54, y: 37, w: 7, h: 4 });
  for (const [i, x] of [55, 58].entries()) {
    p.object(
      `terrace-chair-n${String(i)}`,
      "",
      "terrace-chair",
      { x, y: 36, w: 2, h: 1 },
      { blocks: false },
    );
    p.object(
      `terrace-chair-s${String(i)}`,
      "",
      "terrace-chair",
      { x, y: 42, w: 2, h: 1 },
      { facing: "n", blocks: false },
    );
  }
  p.object(
    "terrace-chair-w",
    "",
    "terrace-chair",
    { x: 52, y: 39, w: 2, h: 2 },
    { facing: "e", blocks: false },
  );
  p.object(
    "terrace-chair-e",
    "",
    "terrace-chair",
    { x: 61, y: 39, w: 2, h: 2 },
    { facing: "w", blocks: false },
  );
  p.anchor("terrace-table", "relax", { x: 58, y: 42 });
  p.object("terrace-round-table", "", "terrace-round-table", { x: 73, y: 39, w: 3, h: 4 });
  p.object(
    "terrace-sofa",
    "",
    "terrace-sofa",
    { x: 76, y: 36, w: 3, h: 6 },
    { facing: "w", artWidth: 4 },
  );
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

/** The approved composition on a navigable 80×46 grid, `CELL_PX` px per cell; art is looked up by object sprite key. */
export function officePlan(): OfficePlan {
  const p = new Plan(OFFICE_FLOOR_ID, WIDTH, HEIGHT);
  structure(p);
  workplaces(p);
  sharedSpaces(p);
  outdoors(p);
  decor(p);
  p.plan.template.furniture = p.plan.objects;
  return p.plan;
}
