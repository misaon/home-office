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
  | "whiteboard"
  | "elevator"
  | "car"
  | "wander";

/** A named cell an actor can walk to and use; `group` narrows seats to a zone (dev, qa, analyst). */
export type Anchor = { id: string; kind: AnchorKind; at: Point; facing: Facing; group?: string };

/**
 * A placed object: `sprite` is the manifest key the renderer looks up (`furniture/<sprite>`), `animation`
 * its current state, `at`/`w`/`h` the footprint in cells (bottom-left visual pivot), `blocks` whether the
 * footprint is impassable.
 */
export type Furniture = {
  sprite: string;
  animation: string;
  at: Point;
  w: number;
  h: number;
  blocks: boolean;
  /**
   * Width of the art in cells when it is wider than the footprint (a chair around a one-cell seat); the sprite
   * is then centred on the footprint instead of pinned to its bottom-left corner.
   */
  artWidth?: number;
  /**
   * Height of the art in cells: the sprite is scaled to stand exactly this tall (its width follows the art) and
   * centred on the footprint — potted plants of different shapes all stand equally tall.
   */
  artHeight?: number;
  /**
   * How a multi-frame animation plays: `loop` cycles (bubbling water); `near` scrubs the frames by proximity —
   * forward while somebody stands within reach, backward as they leave; `sim` follows the 0…1 amount the
   * simulation publishes for the sprite key in `World.animations` (the elevator doors).
   */
  playback?: "loop" | "near" | "sim";
  /** `floor` draws the art under everybody (rugs, the elevator cabin); default `objects` sorts it with the actors. */
  layer?: "floor" | "objects";
  /** Shifts the art down by this many cells (a chair tucked under a desk); the footprint and sorting stay put. */
  artOffsetY?: number;
};

export type FloorTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Sprite key per cell (`tiles/floor-carpet`), or null for void. */
  floor: (string | null)[];
  /** Wall cells (impassable). */
  walls: Uint8Array;
  furniture: Furniture[];
  anchors: Anchor[];
};

/** The collision grid of a floor: walls, void cells and blocking furniture. */
export function gridFor(template: FloorTemplate): Grid {
  const grid = new Grid(template.width, template.height);
  for (let y = 0; y < template.height; y += 1) {
    for (let x = 0; x < template.width; x += 1) {
      if (
        template.walls[y * template.width + x] === 1 ||
        template.floor[y * template.width + x] === null
      ) {
        grid.setWalkable({ x, y }, false);
      }
    }
  }
  for (const f of template.furniture) {
    if (f.blocks) {
      grid.fill(f.at.x, f.at.y, f.w, f.h, false);
    }
  }
  return grid;
}
