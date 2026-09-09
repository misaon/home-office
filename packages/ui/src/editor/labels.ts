import type { Draft } from "./draft.ts";

/** A name written across the middle of a shape, in cell coordinates. */
export type Label = { text: string; x: number; y: number };

type Component = { cells: number[]; kind: string };

const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Contiguous areas of the same room, found by flooding four ways. */
function* components(draft: Draft): Generator<Component> {
  const seen = new Uint8Array(draft.width * draft.height);
  for (let start = 0; start < draft.room.length; start += 1) {
    const kind = draft.room[start] ?? null;
    if (kind === null || seen[start] === 1) {
      continue;
    }
    const cells: number[] = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const index = queue.pop() ?? 0;
      cells.push(index);
      const x = index % draft.width;
      const y = Math.floor(index / draft.width);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * draft.width + nx;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < draft.width &&
          ny < draft.height &&
          seen[next] === 0 &&
          draft.room[next] === kind
        ) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    yield { cells, kind };
  }
}

/**
 * The most interior cell of an area: depth grows inward from its edge and the label takes the deepest
 * cell. The middle of the bounding box is wrong the moment a room is not a rectangle — a corridor
 * wrapped around other rooms would have its name printed inside one of them.
 */
function heart(draft: Draft, cells: readonly number[]): { x: number; y: number } {
  const member = new Set(cells);
  const depth = new Map<number, number>();
  const queue: number[] = [];
  const outside = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= draft.width || y >= draft.height || !member.has(y * draft.width + x);
  for (const index of cells) {
    const x = index % draft.width;
    const y = Math.floor(index / draft.width);
    if (NEIGHBOURS.some(([dx, dy]) => outside(x + dx, y + dy))) {
      depth.set(index, 1);
      queue.push(index);
    }
  }
  let deepest = cells[0] ?? 0;
  let best = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] ?? 0;
    const distance = depth.get(index) ?? 1;
    if (distance > best) {
      best = distance;
      deepest = index;
    }
    const x = index % draft.width;
    const y = Math.floor(index / draft.width);
    for (const [dx, dy] of NEIGHBOURS) {
      const next = (y + dy) * draft.width + (x + dx);
      if (member.has(next) && !depth.has(next)) {
        depth.set(next, distance + 1);
        queue.push(next);
      }
    }
  }
  return { x: (deepest % draft.width) + 0.5, y: Math.floor(deepest / draft.width) + 0.5 };
}

/** Every placed shape names itself, so a colour never has to be remembered. */
export const labelsOf = (draft: Draft): Label[] => [
  ...[...components(draft)].map(({ cells, kind }) => {
    const at = heart(draft, cells);
    return { text: kind, x: at.x, y: at.y };
  }),
  ...draft.objects.map((object) => ({
    text: object.kind,
    x: object.x + object.w / 2,
    y: object.y + object.h / 2,
  })),
  ...draft.doors.map((door) => ({
    text: door.kind,
    x: door.x + door.w / 2,
    y: door.y + door.h / 2,
  })),
];
