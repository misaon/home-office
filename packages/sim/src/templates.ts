import { type Facing, Grid, type Point } from "./grid.ts";

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

/** One floor: how large the plane is and the spots on it. Nothing on it blocks movement yet. */
export type FloorTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  anchors: Anchor[];
};

/** The collision grid of a floor. The plane is empty, so every cell is walkable. */
export const gridFor = (template: FloorTemplate): Grid => new Grid(template.width, template.height);
