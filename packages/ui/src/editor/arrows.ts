import { type Facing, OBJECT_SPEC } from "@ho/protocol";
import type { Draft } from "./draft.ts";

/** An arrow through the middle of a shape, in cell coordinates, pointing the way it is turned. */
export type Arrow = { x: number; y: number; dx: number; dy: number };

const STEP: Readonly<Record<Facing, { dx: number; dy: number }>> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

/** Doorways always show which way they open; furniture only where its direction means something. */
const arrow = (shape: { x: number; y: number; w: number; h: number; facing: Facing }): Arrow => {
  const step = STEP[shape.facing];
  return {
    x: shape.x + shape.w / 2,
    y: shape.y + shape.h / 2,
    dx: step.dx,
    dy: step.dy,
  };
};

export const arrowsOf = (draft: Draft): Arrow[] => [
  ...draft.doors.map((door) => arrow(door)),
  ...draft.objects
    .filter((object) => OBJECT_SPEC[object.kind].arrow)
    .map((object) => arrow(object)),
];
