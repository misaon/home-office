import { gridFromMap, type TileMap } from "./cells.ts";
import type { Facing, Grid, Point } from "./grid.ts";

export type AnchorKind =
  | "desk"
  | "boss-desk"
  | "coffee"
  | "restroom"
  | "smoke"
  | "relax"
  | "sleep"
  | "mailbox"
  | "entrance"
  | "reception"
  | "elevator"
  | "car"
  | "wander";

/** A named cell an actor can walk to and use; `group` reserves a spot for one kind (the boss's desk). */
export type Anchor = { id: string; kind: AnchorKind; at: Point; facing: Facing; group?: string };

/** One floor: a compiled layout and the spots its characters move between. */
export type FloorTemplate = {
  id: string;
  name: string;
  map: TileMap;
  anchors: Anchor[];
};

export const gridFor = (template: FloorTemplate): Grid => gridFromMap(template.map);
