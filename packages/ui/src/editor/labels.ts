import type { Draft } from "./draft.ts";

/** A name written across the middle of a shape, in cell coordinates. */
export type Label = { text: string; x: number; y: number };

/** One label per contiguous area of the same room, not per row of it. */
function roomLabels(draft: Draft): Label[] {
  const seen = new Uint8Array(draft.width * draft.height);
  const out: Label[] = [];
  for (let start = 0; start < draft.room.length; start += 1) {
    const kind = draft.room[start] ?? null;
    if (kind === null || seen[start] === 1) {
      continue;
    }
    let minX = draft.width;
    let maxX = 0;
    let minY = draft.height;
    let maxY = 0;
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const index = queue.pop() ?? 0;
      const x = index % draft.width;
      const y = Math.floor(index / draft.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
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
    out.push({ text: kind, x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2 });
  }
  return out;
}

/** Every placed shape names itself, so a colour never has to be remembered. */
export const labelsOf = (draft: Draft): Label[] => [
  ...roomLabels(draft),
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
