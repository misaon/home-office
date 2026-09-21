import { z } from "zod";
import {
  DoorKind,
  Facing,
  LAYOUT_MAX,
  LayoutCell,
  type LayoutRect,
  LayoutSpan,
  ObjectKind,
  objectSize,
  OfficeLayout,
  RoomKind,
  WallMaterial,
} from "./office-layout.ts";

const OBJECTS_MAX = 4000;
export const EMPTY_CELL = " ";

const LegendMeaning = z.union([WallMaterial, DoorKind, RoomKind]);
export type LegendMeaning = z.infer<typeof LegendMeaning>;

const LegendChar = z
  .string()
  .length(1)
  .refine((char) => char !== EMPTY_CELL, "a space means no room; pick another character");

const rowsAgree = (map: readonly string[]): string | null => {
  const width = map[0]?.length ?? 0;
  const odd = map.findIndex((row) => row.length !== width);
  return odd === -1
    ? null
    : `row ${String(odd + 1)} has ${String(map[odd]?.length ?? 0)} characters, the first row has ${String(width)}`;
};

const unknownChar = (
  legend: Readonly<Record<string, LegendMeaning>>,
  map: readonly string[],
): string | null => {
  for (const [rowIndex, row] of map.entries()) {
    for (let column = 0; column < row.length; column += 1) {
      const char = row.charAt(column);
      if (char !== EMPTY_CELL && !(char in legend)) {
        return `"${char}" at row ${String(rowIndex + 1)}, column ${String(column + 1)} is not in the legend`;
      }
    }
  }
  return null;
};

const TextObject = z.object({
  kind: ObjectKind,
  x: LayoutCell,
  y: LayoutCell,
  facing: Facing,
  w: LayoutSpan.optional(),
  h: LayoutSpan.optional(),
});

export const OfficeLayoutText = z
  .object({
    version: z.literal(2),
    id: OfficeLayout.shape.id,
    name: OfficeLayout.shape.name,
    legend: z.record(LegendChar, LegendMeaning),
    map: z.array(z.string().min(4).max(LAYOUT_MAX)).min(4).max(LAYOUT_MAX),
    objects: z.array(TextObject).max(OBJECTS_MAX),
  })
  .superRefine((text, ctx) => {
    const problem = rowsAgree(text.map) ?? unknownChar(text.legend, text.map);
    if (problem !== null) {
      ctx.addIssue({ code: "custom", message: problem, path: ["map"] });
    }
  });
export type OfficeLayoutText = z.infer<typeof OfficeLayoutText>;

type Classified = {
  walls: Map<string, WallMaterial>;
  doors: Map<string, DoorKind>;
  rooms: Map<string, RoomKind>;
};

const classify = (legend: Readonly<Record<string, LegendMeaning>>): Classified => {
  const out: Classified = { walls: new Map(), doors: new Map(), rooms: new Map() };
  for (const [char, meaning] of Object.entries(legend)) {
    const wall = WallMaterial.safeParse(meaning);
    const door = DoorKind.safeParse(meaning);
    if (wall.success) {
      out.walls.set(char, wall.data);
    } else if (door.success) {
      out.doors.set(char, door.data);
    } else {
      out.rooms.set(char, RoomKind.parse(meaning));
    }
  }
  return out;
};

const runsOf = <T extends string>(
  cells: readonly (T | null)[],
  width: number,
  height: number,
): (LayoutRect & { value: T })[] => {
  const runs: (LayoutRect & { value: T })[] = [];
  for (let y = 0; y < height; y += 1) {
    let start = 0;
    let current: T | null = null;
    for (let x = 0; x <= width; x += 1) {
      const value = x === width ? null : (cells[y * width + x] ?? null);
      if (value !== current) {
        if (current !== null) {
          runs.push({ x: start, y, w: x - start, h: 1, value: current });
        }
        current = value;
        start = x;
      }
    }
  }
  return runs;
};

const doorsOf = (
  cells: readonly (DoorKind | null)[],
  width: number,
  height: number,
): OfficeLayout["doors"] => {
  const taken = new Set<number>();
  const doors: OfficeLayout["doors"] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const kind = cells[index] ?? null;
      if (kind === null || taken.has(index)) {
        continue;
      }
      const right = x + 1 < width && cells[index + 1] === kind && !taken.has(index + 1);
      const below = y + 1 < height && cells[index + width] === kind && !taken.has(index + width);
      const rect = right
        ? { x, y, w: 2, h: 1 }
        : below
          ? { x, y, w: 1, h: 2 }
          : { x, y, w: 1, h: 1 };
      for (let dy = 0; dy < rect.h; dy += 1) {
        for (let dx = 0; dx < rect.w; dx += 1) {
          taken.add((y + dy) * width + x + dx);
        }
      }
      doors.push({ ...rect, kind, facing: rect.h > rect.w ? "e" : "s" });
    }
  }
  return doors;
};

function officeFromText(text: OfficeLayoutText): OfficeLayout {
  const height = text.map.length;
  const width = text.map[0]?.length ?? 0;
  const legend = classify(text.legend);
  const walls: (WallMaterial | null)[] = Array.from({ length: width * height }, () => null);
  const rooms: (RoomKind | null)[] = Array.from({ length: width * height }, () => null);
  const doors: (DoorKind | null)[] = Array.from({ length: width * height }, () => null);
  for (const [y, row] of text.map.entries()) {
    for (let x = 0; x < width; x += 1) {
      const char = row.charAt(x);
      const index = y * width + x;
      walls[index] = legend.walls.get(char) ?? null;
      doors[index] = legend.doors.get(char) ?? null;
      rooms[index] = legend.rooms.get(char) ?? null;
    }
  }
  return {
    id: text.id,
    name: text.name,
    width,
    height,
    walls: runsOf(walls, width, height).map((run) => ({
      x: run.x,
      y: run.y,
      w: run.w,
      h: run.h,
      material: run.value,
    })),
    rooms: runsOf(rooms, width, height).map((run) => ({
      x: run.x,
      y: run.y,
      w: run.w,
      h: run.h,
      room: run.value,
    })),
    doors: doorsOf(doors, width, height),
    objects: text.objects.map((object) => {
      const size = objectSize(object.kind, object.facing);
      return {
        x: object.x,
        y: object.y,
        w: object.w ?? size.w,
        h: object.h ?? size.h,
        kind: object.kind,
        facing: object.facing,
      };
    }),
  };
}

export const StoredOfficeLayout = z.union([
  OfficeLayout,
  OfficeLayoutText.transform((text) => officeFromText(text)),
]);
