import {
  DoorKind,
  type LayoutRect,
  objectSize,
  type OfficeLayout,
  RoomKind,
  WallMaterial,
} from "./office-layout.ts";
import { EMPTY_CELL, type LegendMeaning, type OfficeLayoutText } from "./office-layout-text.ts";

const LEGEND_ORDER: readonly LegendMeaning[] = [
  ...WallMaterial.options,
  ...DoorKind.options,
  ...RoomKind.options,
];

const DEFAULT_LEGEND: Readonly<Record<LegendMeaning, string>> = {
  wall: "#",
  glass: "%",
  door: "D",
  "glass-door": "G",
  reception: "r",
  "boss-office": "b",
  "office-developers": "d",
  "office-qa": "q",
  "office-analysts": "a",
  "team-room": "t",
  meeting: "m",
  kitchen: "k",
  toilets: "w",
  corridor: ".",
  terrace: "e",
};

export function textFromOffice(office: OfficeLayout): OfficeLayoutText {
  const rows = Array.from({ length: office.height }, () =>
    Array.from({ length: office.width }, () => EMPTY_CELL),
  );
  const put = (rect: LayoutRect, char: string): void => {
    const bottom = Math.min(rect.y + rect.h, office.height);
    const right = Math.min(rect.x + rect.w, office.width);
    for (let { y } = rect; y < bottom; y += 1) {
      for (let { x } = rect; x < right; x += 1) {
        const row = rows[y];
        if (row !== undefined) {
          row[x] = char;
        }
      }
    }
  };
  for (const rect of office.rooms) {
    put(rect, DEFAULT_LEGEND[rect.room]);
  }
  for (const rect of office.walls) {
    put(rect, DEFAULT_LEGEND[rect.material]);
  }
  for (const door of office.doors) {
    put(door, DEFAULT_LEGEND[door.kind]);
  }
  const used = new Set(rows.flat());
  const legend: Record<string, LegendMeaning> = {};
  for (const meaning of LEGEND_ORDER) {
    const char = DEFAULT_LEGEND[meaning];
    if (used.has(char)) {
      legend[char] = meaning;
    }
  }
  return {
    version: 2,
    id: office.id,
    name: office.name,
    legend,
    map: rows.map((row) => row.join("")),
    objects: office.objects.map((object) => {
      const size = objectSize(object.kind, object.facing);
      return {
        kind: object.kind,
        x: object.x,
        y: object.y,
        facing: object.facing,
        ...(object.w === size.w ? {} : { w: object.w }),
        ...(object.h === size.h ? {} : { h: object.h }),
      };
    }),
  };
}

const INDENT = "    ";

const inline = (value: Readonly<Record<string, unknown>>): string =>
  `{ ${Object.entries(value)
    .map(([key, field]) => `${JSON.stringify(key)}: ${JSON.stringify(field)}`)
    .join(", ")} }`;

export const renderLayoutText = (text: OfficeLayoutText): string =>
  [
    "{",
    `  "version": 2,`,
    `  "id": ${JSON.stringify(text.id)},`,
    `  "name": ${JSON.stringify(text.name)},`,
    `  "legend": {`,
    Object.entries(text.legend)
      .map(([char, meaning]) => `${INDENT}${JSON.stringify(char)}: ${JSON.stringify(meaning)}`)
      .join(",\n"),
    "  },",
    `  "map": [`,
    text.map.map((row) => `${INDENT}${JSON.stringify(row)}`).join(",\n"),
    "  ],",
    `  "objects": [`,
    text.objects.map((object) => `${INDENT}${inline(object)}`).join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
