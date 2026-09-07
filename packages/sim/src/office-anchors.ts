import type { Plan } from "./office-builder.ts";

/**
 * Spots for idle strolls (D23): the corridors, the staff's own rooms, the meeting room and the terrace. The
 * boss office has none of these — its anchors carry the `boss` group and are his alone (`office-plan.ts`).
 */
export function strollSpots(p: Plan): void {
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
  // Staff also stroll inside their own rooms, the meeting room and the terrace (D23).
  for (const [id, at] of [
    ["dev-walk-1", { x: 36, y: 4 }],
    ["dev-walk-2", { x: 34, y: 12 }],
    ["dev-walk-3", { x: 16, y: 12 }],
    ["qa-walk", { x: 58, y: 4 }],
    ["analyst-walk", { x: 70, y: 4 }],
    ["meeting-walk", { x: 45, y: 31 }],
    ["terrace-walk", { x: 64, y: 43 }],
  ] as const) {
    p.anchor(id, "wander", at, "s");
  }
}
