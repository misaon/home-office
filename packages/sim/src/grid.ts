export type Point = { x: number; y: number };
export type Facing = "n" | "s" | "e" | "w";

export const key = (p: Point): number => p.y * 4096 + p.x;
export const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const facingTowards = (from: Point, to: Point): Facing => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "e" : "w";
  }
  return dy >= 0 ? "s" : "n";
};

/** Walkability per tile; mutable so furniture and other actors can reserve cells. */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly #walkable: Uint8Array;

  constructor(width: number, height: number, walkable?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.#walkable = walkable ?? new Uint8Array(width * height).fill(1);
  }

  inBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  isWalkable(p: Point): boolean {
    return this.inBounds(p) && this.#walkable[p.y * this.width + p.x] === 1;
  }

  setWalkable(p: Point, walkable: boolean): void {
    if (this.inBounds(p)) {
      this.#walkable[p.y * this.width + p.x] = walkable ? 1 : 0;
    }
  }

  fill(x: number, y: number, w: number, h: number, walkable: boolean): void {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        this.setWalkable({ x: xx, y: yy }, walkable);
      }
    }
  }
}

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** A* on the 4-connected grid. Returns the path excluding `from`, including `to`; empty when unreachable or trivial. */
export function findPath(
  grid: Grid,
  from: Point,
  to: Point,
  blocked: (p: Point) => boolean = () => false,
): Point[] {
  if (samePoint(from, to)) {
    return [];
  }
  if (!grid.isWalkable(to) || blocked(to)) {
    return [];
  }
  const open: { p: Point; f: number }[] = [{ p: from, f: manhattan(from, to) }];
  const gScore = new Map<number, number>([[key(from), 0]]);
  const cameFrom = new Map<number, Point>();
  const closed = new Set<number>();
  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (
        (open[i]?.f ?? Number.POSITIVE_INFINITY) < (open[bestIndex]?.f ?? Number.POSITIVE_INFINITY)
      ) {
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === undefined) {
      break;
    }
    if (samePoint(current.p, to)) {
      const path: Point[] = [];
      let cursor: Point | undefined = current.p;
      while (cursor !== undefined && !samePoint(cursor, from)) {
        path.push(cursor);
        cursor = cameFrom.get(key(cursor));
      }
      return path.toReversed();
    }
    closed.add(key(current.p));
    const g = gScore.get(key(current.p)) ?? 0;
    for (const d of NEIGHBOURS) {
      const next = { x: current.p.x + d.x, y: current.p.y + d.y };
      const k = key(next);
      if (closed.has(k) || !grid.isWalkable(next) || (blocked(next) && !samePoint(next, to))) {
        continue;
      }
      const tentative = g + 1;
      if (tentative < (gScore.get(k) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(k, tentative);
        cameFrom.set(k, current.p);
        const f = tentative + manhattan(next, to);
        const existing = open.find((o) => key(o.p) === k);
        if (existing === undefined) {
          open.push({ p: next, f });
        } else {
          existing.f = f;
        }
      }
    }
  }
  return [];
}
