import { type Facing, OBJECT_SPEC } from "@ho/protocol";
import { CELL_PX } from "@ho/sim";
import { Graphics } from "pixi.js";
import type { Draft } from "./draft.ts";

/** An arrow through the middle of a shape, in cell coordinates, pointing the way it is turned. */
export type Arrow = { x: number; y: number; dx: number; dy: number };

const STEP: Readonly<Record<Facing, { dx: number; dy: number }>> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

/** The arrow through the middle of a rectangle, pointing the way it is turned. */
export const arrowFor = (
  shape: { x: number; y: number; w: number; h: number },
  facing: Facing,
): Arrow => {
  const step = STEP[facing];
  return {
    x: shape.x + shape.w / 2,
    y: shape.y + shape.h / 2,
    dx: step.dx,
    dy: step.dy,
  };
};

/** Doorways always show which way they open; furniture only where its direction means something. */
export const arrowsOf = (draft: Draft): Arrow[] => [
  ...draft.doors.map((door) => arrowFor(door, door.facing)),
  ...draft.objects
    .filter((object) => OBJECT_SPEC[object.kind].arrow)
    .map((object) => arrowFor(object, object.facing)),
];

/**
 * One arrow, as its own display object: a stem and a head. Drawing them into a Graphics that already
 * holds other shapes made Pixi join the polygons into large filled triangles across the map.
 */
export function arrowGraphic(arrow: Arrow, colour: number): Graphics {
  const graphics = new Graphics();
  const length = CELL_PX * 0.9;
  const thickness = CELL_PX * 0.16;
  const head = length * 0.5;
  const cx = arrow.x * CELL_PX;
  const cy = arrow.y * CELL_PX;
  const tipX = cx + (arrow.dx * length) / 2;
  const tipY = cy + (arrow.dy * length) / 2;
  const baseX = tipX - arrow.dx * head;
  const baseY = tipY - arrow.dy * head;
  const tailX = cx - (arrow.dx * length) / 2;
  const tailY = cy - (arrow.dy * length) / 2;
  if (arrow.dx === 0) {
    graphics.rect(cx - thickness / 2, Math.min(tailY, baseY), thickness, Math.abs(baseY - tailY));
    graphics.fill(colour);
    graphics.poly([cx, tipY, cx - head / 2, baseY, cx + head / 2, baseY]);
    graphics.fill(colour);
    return graphics;
  }
  graphics.rect(Math.min(tailX, baseX), cy - thickness / 2, Math.abs(baseX - tailX), thickness);
  graphics.fill(colour);
  graphics.poly([tipX, cy, baseX, cy - head / 2, baseX, cy + head / 2]);
  graphics.fill(colour);
  return graphics;
}
