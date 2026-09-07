import type { Plan } from "./office-builder.ts";

/**
 * Props measured on the approved reference: plants (footprint = the pot, art two cells wide and centred), floor
 * lamp, pictures and windows on wall faces (non-blocking, drawn where the painting hangs), hedges and bins.
 * Keys double as delivery file names; the same key is shared by identical props.
 */
export function decor(p: Plan): void {
  const plant = (id: string, x: number, y: number): void => {
    p.object(`plant-${id}`, "", "plant", { x, y, w: 1, h: 1 }, { artWidth: 2 });
  };
  const wall = (id: string, sprite: string, x: number, y: number, w: number, h: number): void => {
    p.object(id, "", sprite, { x, y, w, h }, { blocks: false });
  };
  // Rugs (floor layer, walk-through): teal under the workplaces and the meeting table, green under the dining
  // table, beige in the lounge — the reference's floor is the same orange everywhere else.
  const rug = (id: string, sprite: string, x: number, y: number, w: number, h: number): void => {
    p.object(`rug-${id}`, "", sprite, { x, y, w, h }, { blocks: false, layer: "floor" });
  };
  rug("boss", "rug-teal", 2, 6, 8, 8);
  rug("dev-1", "rug-teal", 18, 6, 17, 7);
  rug("dev-2", "rug-teal", 38, 6, 17, 7);
  rug("qa", "rug-teal", 58, 6, 8, 8);
  rug("analyst", "rug-teal", 70, 6, 8, 8);
  rug("meeting", "rug-teal", 35, 24, 12, 8);
  rug("dining", "rug-green", 53, 26, 10, 7);
  rug("lounge", "rug-beige", 26, 37, 8, 8);
  // Boss office: picture over the desk, standing lamp, plants in both west corners, window in the west wall.
  wall("picture-boss", "picture", 6, 1, 4, 2);
  wall("window-boss", "window", 0, 4, 1, 4);
  p.object("floor-lamp", "", "floor-lamp", { x: 12, y: 5, w: 1, h: 1 }, { artWidth: 2 });
  plant("boss-n", 3, 5);
  plant("boss-s", 2, 14);
  // Developers: a tall picture leaning on the west wall, a planter between the desk blocks, windows and an
  // aquarium along the north wall, a picture, a plant stand, small pictures south.
  wall("picture-dev-w", "picture-tall", 15, 6, 1, 4);
  p.object("planter", "", "planter-tall", { x: 35, y: 12, w: 2, h: 1 });
  plant("dev-w", 16, 5);
  wall("window-dev-1", "window", 23, 1, 4, 2);
  wall("aquarium", "aquarium", 28, 1, 3, 2);
  wall("window-dev-2", "window", 34, 1, 4, 2);
  p.object("plant-table", "", "plant-table", { x: 34, y: 4, w: 2, h: 2 });
  wall("picture-dev", "picture", 39, 1, 3, 2);
  wall("window-dev-3", "window", 45, 1, 4, 2);
  for (const [i, x] of [21, 24, 26].entries()) {
    wall(`picture-dev-s${String(i)}`, "picture-small", x, 14, 2, 1);
  }
  // QA and analysts: a picture over each desk pair, a plant by the door, a radiator on the east wall.
  wall("picture-qa", "picture", 60, 1, 3, 2);
  plant("qa", 57, 5);
  wall("picture-analyst", "picture", 72, 1, 3, 2);
  plant("analyst", 77, 5);
  wall("radiator", "radiator", 79, 4, 1, 4);
  // Corridor: a plant below the boss office, a bin at the far east end.
  plant("corridor", 2, 19);
  p.object("bin", "", "bin", { x: 78, y: 19, w: 1, h: 1 });
  // Reception: binder shelf and picture on the backdrop wall, a plant west of the counter.
  wall("wall-shelf", "wall-shelf", 13, 22, 7, 2);
  wall("picture-reception", "picture", 21, 22, 2, 2);
  plant("reception", 12, 28);
  // Meeting room: wall screen, projector stand, plant in the north-east corner.
  wall("wall-screen", "wall-screen", 40, 21, 5, 2);
  p.object("projector", "", "projector", { x: 37, y: 22, w: 2, h: 2 });
  plant("meeting", 46, 24);
  // Kitchen: tiled backsplash on the north wall, plant beside the fridge. Toilets: plant below the sinks.
  wall("backsplash", "backsplash", 54, 21, 13, 2);
  plant("kitchen", 67, 24);
  p.object("plant-toilets", "", "plant", { x: 17, y: 44, w: 2, h: 1 });
  // Lounge: two pictures on the north wall, plant by the foosball table.
  wall("picture-lounge-1", "picture", 35, 34, 2, 2);
  wall("picture-lounge-2", "picture", 38, 34, 2, 2);
  plant("lounge", 43, 37);
  // South outer wall: two windows. Terrace: string lights under the glass wall (the rail is glazing in the plan).
  wall("window-south-1", "window", 7, 45, 4, 1);
  wall("window-south-2", "window", 34, 45, 4, 1);
  wall("string-lights", "string-lights", 49, 34, 20, 1);
  // Terrace and spa: hedge along the west edge, bushes under the glass wall, potted plants.
  p.object("hedge", "", "hedge", { x: 49, y: 34, w: 2, h: 11 });
  p.object("bushes", "", "bushes", { x: 66, y: 34, w: 4, h: 2 });
  plant("terrace-1", 70, 43);
  plant("terrace-2", 71, 43);
  plant("terrace-3", 78, 35);
  plant("terrace-4", 78, 42);
  plant("terrace-5", 78, 44);
  plant("spa", 78, 23);
}
