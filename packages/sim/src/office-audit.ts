import { findPath, key, samePoint, type Point } from "./grid.ts";
import type { OfficePlan } from "./office-plan.ts";
import { gridFor } from "./templates.ts";

export type OfficeAudit = {
  issues: string[];
  reachableAnchors: number;
  walkableCells: number;
  disconnected: Point[];
};

/** Read-only diagnostics for the layout lab; uses the same collision grid and A* as live agents. */
export function auditOffice(plan: OfficePlan): OfficeAudit {
  const grid = gridFor(plan.template);
  const result: OfficeAudit = {
    issues: [],
    reachableAnchors: 0,
    walkableCells: 0,
    disconnected: [],
  };
  const start = plan.template.anchors.find((a) => a.id === "elevator")?.at;
  if (start === undefined || !grid.isWalkable(start)) {
    result.issues.push("Elevator anchor is missing or blocked");
    return result;
  }
  const reachable = new Set<number>([key(start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i];
    if (p === undefined) {
      continue;
    }
    for (const next of [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ]) {
      if (grid.isWalkable(next) && !reachable.has(key(next))) {
        reachable.add(key(next));
        queue.push(next);
      }
    }
  }
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.isWalkable({ x, y })) {
        result.walkableCells += 1;
        if (!reachable.has(key({ x, y }))) {
          result.disconnected.push({ x, y });
        }
      }
    }
  }
  const ids = new Set<string>();
  for (const a of plan.template.anchors) {
    if (ids.has(a.id)) {
      result.issues.push(`Duplicate anchor: ${a.id}`);
    }
    ids.add(a.id);
    if (
      grid.isWalkable(a.at) &&
      (samePoint(start, a.at) || findPath(grid, start, a.at).length > 0)
    ) {
      result.reachableAnchors += 1;
    } else {
      result.issues.push(`Unreachable anchor: ${a.id}`);
    }
  }
  for (const d of plan.doors) {
    for (let y = d.y; y < d.y + d.h; y += 1) {
      for (let x = d.x; x < d.x + d.w; x += 1) {
        if (!reachable.has(key({ x, y }))) {
          result.issues.push(`Blocked doorway: ${d.id}`);
        }
      }
    }
  }
  if (result.disconnected.length > 0) {
    result.issues.push(`${String(result.disconnected.length)} disconnected floor cells`);
  }
  return result;
}
