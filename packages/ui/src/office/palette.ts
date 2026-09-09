/** The office has no art yet, so every material is a colour. Unknown ids fall back to the defaults. */
export const GROUND = 0xf1f2f4;
export const GRID_LINE = 0xe3e6eb;
/** Every eighth line is stronger, the way squared paper reads. */
export const GRID_MAJOR = 0xcdd2db;
export const MAP_EDGE = 0xaeb5c2;

export const FLOOR: Readonly<Record<string, number>> = { office: 0xffffff };
export const FLOOR_DEFAULT = 0xffffff;

export const WALL: Readonly<Record<string, number>> = { wall: 0x2b3140, glass: 0x8fb8c9 };
export const WALL_DEFAULT = 0x2b3140;

export const OBJECT_FILL = 0xb9bfca;
export const OBJECT_EDGE = 0x8b93a1;

export const ROOM: Readonly<Record<string, number>> = {};
export const ROOM_DEFAULT = 0x6f9bd8;
/** Room designation is a tint over the floor, as Prison Architect's chessboard overlay is. */
export const ROOM_ALPHA = 0.16;

export const DOT = 0x2b3140;
export const DOT_SELECTED = 0xffd166;
export const DOT_EDGE = 0x1f2430;

export const colourOf = (
  table: Readonly<Record<string, number>>,
  material: string,
  fallback: number,
): number => table[material] ?? fallback;
