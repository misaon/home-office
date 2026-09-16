import { NEIGHBOURS, type TileMap } from "@ho/sim";

type Edge = { x1: number; y1: number; x2: number; y2: number; room: string };

export function roomOutline(map: TileMap): Edge[] {
  const at = (x: number, y: number): string | null =>
    x < 0 || y < 0 || x >= map.width || y >= map.height
      ? null
      : (map.room[y * map.width + x] ?? null);
  const edges: Edge[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const room = at(x, y);
      if (room === null) {
        continue;
      }
      for (const { x: dx, y: dy } of NEIGHBOURS) {
        if (at(x + dx, y + dy) === room) {
          continue;
        }
        const x1 = x + (dx > 0 ? 1 : 0);
        const y1 = y + (dy > 0 ? 1 : 0);
        edges.push({ x1, y1, x2: x1 + (dx === 0 ? 1 : 0), y2: y1 + (dy === 0 ? 1 : 0), room });
      }
    }
  }
  return edges;
}
