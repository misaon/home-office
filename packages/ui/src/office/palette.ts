/** The office has no art yet, so every material is a colour. Unknown ids fall back to the defaults. */
export const GROUND = 0xf1f2f4;
/** One colour and one weight for every line of the grid, the map's own edge included. */
export const GRID_LINE = 0xe3e6eb;

export const FLOOR: Readonly<Record<string, number>> = { office: 0xffffff };
export const FLOOR_DEFAULT = 0xffffff;

export const WALL: Readonly<Record<string, number>> = { wall: 0x2b3140, glass: 0x8fb8c9 };
export const WALL_DEFAULT = 0x2b3140;

/**
 * Doors and furniture, by what they are. These are placeholders until the art lands: the id in the
 * layout never changes, so a sprite added later replaces the fill without touching a saved office.
 */
export const OBJECTS: Readonly<Record<string, number>> = {
  door: 0xb07d4a,
  "glass-door": 0x7fb4c9,
  elevator: 0x6f7787,
  "desk-developer": 0xa8825c,
  "desk-qa": 0xa87c6f,
  "desk-analyst": 0xa08f5c,
  "desk-boss": 0x8a6a45,
  "reception-counter": 0xb59a6a,
  "meeting-table": 0x9c7f57,
  "office-chair": 0x8b93a1,
  "lounge-chair": 0x9c8ea6,
  "dining-table": 0xb08a62,
  "dining-chair": 0x9aa2b1,
  "kitchen-counter": 0xbfc4cc,
  fridge: 0xd6dae1,
  "coffee-machine": 0x77808f,
  grill: 0x5f6673,
  "hot-tub": 0x6fb2c9,
  bookcase: 0x8f6f4e,
  plant: 0x6f9e5a,
  picture: 0xc9a86f,
  "air-conditioning": 0xcfd9e2,
  window: 0xa8cfe0,
  toilet: 0xe3e8ee,
  sink: 0xdfe6ec,
  "hand-dryer": 0xc3cad4,
  bin: 0x7d848f,
  "standing-ashtray": 0x6b7280,
};

export const OBJECT_FILL = 0xb9bfca;
export const OBJECT_EDGE = 0x8b93a1;

/** A hue per room, so a plan can be read without consulting a legend. */
export const ROOM: Readonly<Record<string, number>> = {
  reception: 0xe0a33c,
  "boss-office": 0x8b6fd0,
  "office-developers": 0x4c8bf5,
  "office-qa": 0x2fae9e,
  "office-analysts": 0xd06fb0,
  "team-room": 0x6f8fae,
  meeting: 0xc9a227,
  kitchen: 0xe0603c,
  toilets: 0x3cb4e0,
  corridor: 0x9aa2b1,
  terrace: 0x5fae4c,
};
/** The tint is faint, so the same hue draws the room's own edge to show where it ends. */
export const ROOM_EDGE_ALPHA = 0.75;
export const ROOM_DEFAULT = 0x6f9bd8;
/** Room designation is a tint over the floor, as Prison Architect's chessboard overlay is. */
export const ROOM_ALPHA = 0.22;

export const DOT = 0x2b3140;
export const DOT_SELECTED = 0xffd166;
export const DOT_EDGE = 0x1f2430;

export const colourOf = (
  table: Readonly<Record<string, number>>,
  material: string,
  fallback: number,
): number => table[material] ?? fallback;
