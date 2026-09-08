import TinyQueue from "tinyqueue";

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
  #clearance: Uint8Array | null = null;

  constructor(width: number, height: number, walkable?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.#walkable = walkable?.slice() ?? new Uint8Array(width * height).fill(1);
  }

  inBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  isWalkable(p: Point): boolean {
    return this.inBounds(p) && this.#walkable[p.y * this.width + p.x] === 1;
  }

  setWalkable(p: Point, walkable: boolean): void {
    if (this.inBounds(p)) {
      const index = p.y * this.width + p.x;
      const value = walkable ? 1 : 0;
      if (this.#walkable[index] !== value) {
        this.#walkable[index] = value;
        this.#clearance = null;
      }
    }
  }

  /** Prefer space around walls/furniture without making narrow doors or edge targets unreachable. */
  stepCost(p: Point): number {
    this.#clearance ??= this.#buildClearance();
    const distance = this.#clearance[p.y * this.width + p.x] ?? 0;
    return distance <= 1 ? 4 : distance === 2 ? 1.5 : 1;
  }

  /** Two-pass Manhattan distance to static obstacles or the map edge, capped at three cells. */
  #buildClearance(): Uint8Array {
    const distances = new Uint8Array(this.width * this.height).fill(3);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x;
        distances[index] =
          this.#walkable[index] === 0
            ? 0
            : Math.min(
                3,
                x === 0 ? 1 : (distances[index - 1] ?? 3) + 1,
                y === 0 ? 1 : (distances[index - this.width] ?? 3) + 1,
              );
      }
    }
    for (let y = this.height - 1; y >= 0; y -= 1) {
      for (let x = this.width - 1; x >= 0; x -= 1) {
        const index = y * this.width + x;
        distances[index] = Math.min(
          distances[index] ?? 3,
          x === this.width - 1 ? 1 : (distances[index + 1] ?? 3) + 1,
          y === this.height - 1 ? 1 : (distances[index + this.width] ?? 3) + 1,
        );
      }
    }
    return distances;
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

// A turn costs six clear-floor steps: avoid staircases for small clearance gains.
const TURN_COST = 6;
type RouteNode = { order: number; p: Point; direction: number; id: number; g: number; f: number };

/** Clearance/turn-weighted A*: excludes `from`, includes `to`; empty when unreachable or trivial. */
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
  // Arrival direction is part of the state: it determines the cost of the next turn.
  let order = 0;
  const start: RouteNode = {
    order: order++,
    p: from,
    direction: -1,
    id: key(from) * 5 + 4,
    g: 0,
    f: manhattan(from, to),
  };
  const open = new TinyQueue<RouteNode>([start], (a, b) => a.f - b.f || a.order - b.order);
  const gScore = new Map<number, number>([[start.id, 0]]);
  const cameFrom = new Map<number, RouteNode>();
  const closed = new Set<number>();
  while (open.length > 0) {
    const current = open.pop();
    if (current === undefined) {
      break;
    }
    if (closed.has(current.id) || current.g !== gScore.get(current.id)) {
      continue;
    }
    if (samePoint(current.p, to)) {
      const path: Point[] = [];
      let cursor: RouteNode | undefined = current;
      while (cursor !== undefined && cursor.id !== start.id) {
        path.push(cursor.p);
        cursor = cameFrom.get(cursor.id);
      }
      return path.toReversed();
    }
    closed.add(current.id);
    for (const [direction, d] of NEIGHBOURS.entries()) {
      const next = { x: current.p.x + d.x, y: current.p.y + d.y };
      const id = key(next) * 5 + direction;
      // Cells occupied by standing actors are avoided, except the destination itself (meeting points).
      if (closed.has(id) || !grid.isWalkable(next) || (blocked(next) && !samePoint(next, to))) {
        continue;
      }
      const turn = current.direction !== -1 && current.direction !== direction ? TURN_COST : 0;
      const g = current.g + grid.stepCost(next) + turn;
      if (g < (gScore.get(id) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(id, g);
        cameFrom.set(id, current);
        open.push({ order: order++, p: next, direction, id, g, f: g + manhattan(next, to) });
      }
    }
  }
  return [];
}
