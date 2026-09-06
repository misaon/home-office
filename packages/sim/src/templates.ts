import { Grid, type Facing, type Point } from "./grid.ts";

export type AnchorKind =
  | "desk"
  | "boss-desk"
  | "coffee"
  | "restroom"
  | "smoke"
  | "relax"
  | "sleep"
  | "mailbox"
  | "entrance"
  | "reception"
  | "whiteboard"
  | "elevator"
  | "wander";
export type Anchor = { id: string; kind: AnchorKind; at: Point; facing: Facing };
export type Furniture = {
  sprite: string;
  animation: string;
  at: Point;
  w: number;
  h: number;
  blocks: boolean;
};
export type FloorTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Sprite key per cell (`tiles/floor-carpet`), or null for void. */
  floor: (string | null)[];
  /** Wall cells (rendered with the wall autotile, not walkable). */
  walls: Uint8Array;
  furniture: Furniture[];
  anchors: Anchor[];
};

class Builder {
  readonly t: FloorTemplate;

  constructor(id: string, name: string, width: number, height: number, floor: string) {
    this.t = {
      id,
      name,
      width,
      height,
      floor: Array.from({ length: width * height }, (): string | null => floor),
      walls: new Uint8Array(width * height),
      furniture: [],
      anchors: [],
    };
    this.wallRect(0, 0, width, height);
  }

  wall(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < this.t.width && y < this.t.height) {
      this.t.walls[y * this.t.width + x] = 1;
    }
  }

  door(x: number, y: number): void {
    this.t.walls[y * this.t.width + x] = 0;
  }

  /** Walls on the rectangle's perimeter. */
  wallRect(x: number, y: number, w: number, h: number): void {
    for (let i = 0; i < w; i += 1) {
      this.wall(x + i, y);
      this.wall(x + i, y + h - 1);
    }
    for (let j = 0; j < h; j += 1) {
      this.wall(x, y + j);
      this.wall(x + w - 1, y + j);
    }
  }

  floorRect(x: number, y: number, w: number, h: number, sprite: string): void {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        this.t.floor[(y + j) * this.t.width + x + i] = sprite;
      }
    }
  }

  place(sprite: string, at: Point, w = 1, h = 1, blocks = true, animation = "static"): void {
    this.t.furniture.push({ sprite, animation, at, w, h, blocks });
  }

  anchor(
    kind: AnchorKind,
    at: Point,
    facing: Facing,
    id = `${kind}-${String(this.t.anchors.length)}`,
  ): void {
    this.t.anchors.push({ id, kind, at, facing });
  }

  /** A desk with its chair: the agent sits north of the desk facing south, looking at the monitor. */
  desk(x: number, y: number): void {
    this.place("furniture/desk-monitor", { x, y }, 2, 2, true, "off");
    this.place("furniture/chair", { x, y: y - 1 }, 1, 1, false, "static_s");
    this.anchor("desk", { x, y: y - 1 }, "s");
  }

  elevator(x: number, y: number): void {
    this.place("furniture/elevator", { x, y }, 2, 2, true, "closed");
    this.anchor("elevator", { x: x + 2, y: y + 1 }, "w", "elevator");
  }
}

export const LOBBY_ID = "lobby";
const W = 40;
const H = 22;

export function lobbyTemplate(): FloorTemplate {
  const b = new Builder(LOBBY_ID, "Lobby", W, H, "tiles/floor-lobby");
  b.elevator(1, 9);
  // Reception and the board.
  b.place("furniture/reception", { x: 5, y: 3 }, 3, 2);
  b.anchor("reception", { x: 6, y: 5 }, "n");
  b.place("furniture/whiteboard", { x: 10, y: 1 }, 2, 2);
  b.anchor("whiteboard", { x: 11, y: 3 }, "n");
  b.place("furniture/plant", { x: 4, y: 1 }, 1, 2);
  // Mailroom, with the street door the postman uses in the top wall.
  b.place("furniture/mailbox", { x: 19, y: 1 }, 1, 2, true, "empty");
  b.anchor("mailbox", { x: 19, y: 3 }, "n");
  b.door(15, 0);
  b.anchor("entrance", { x: 15, y: 0 }, "s", "entrance");
  // Boss office (top right).
  b.wallRect(25, 0, 15, 9);
  b.door(25, 5);
  b.floorRect(26, 1, 13, 7, "tiles/floor-carpet");
  b.place("furniture/boss-desk", { x: 30, y: 3 }, 3, 2);
  b.place("furniture/chair", { x: 31, y: 2 }, 1, 1, false, "static_s");
  b.anchor("boss-desk", { x: 31, y: 2 }, "s", "boss-desk");
  b.place("furniture/bookshelf", { x: 35, y: 1 }, 2, 2);
  b.place("furniture/plant", { x: 27, y: 1 }, 1, 2);
  // Kitchen (bottom left).
  b.wallRect(0, 12, 14, 10);
  b.door(13, 16);
  b.floorRect(1, 13, 12, 8, "tiles/floor-kitchen");
  b.place("furniture/coffee-machine", { x: 2, y: 13 }, 1, 2, true, "idle");
  b.anchor("coffee", { x: 2, y: 15 }, "n");
  b.place("furniture/fridge", { x: 4, y: 13 }, 1, 2);
  b.place("furniture/sink", { x: 6, y: 13 }, 1, 1);
  b.place("furniture/water-cooler", { x: 10, y: 13 }, 1, 2);
  b.anchor("coffee", { x: 10, y: 15 }, "n");
  // Toilets (bottom middle).
  b.wallRect(15, 14, 10, 8);
  b.door(19, 14);
  b.floorRect(16, 15, 8, 6, "tiles/floor-kitchen");
  b.place("furniture/toilet", { x: 16, y: 16 }, 1, 1);
  b.anchor("restroom", { x: 16, y: 17 }, "n");
  b.place("furniture/toilet", { x: 22, y: 16 }, 1, 1);
  b.anchor("restroom", { x: 22, y: 17 }, "n");
  b.place("furniture/sink", { x: 19, y: 19 }, 1, 1);
  // Relax room (bottom right).
  b.wallRect(26, 12, 14, 10);
  b.door(26, 16);
  b.floorRect(27, 13, 12, 8, "tiles/floor-carpet");
  b.place("furniture/sofa", { x: 30, y: 14 }, 2, 1, false);
  b.anchor("relax", { x: 30, y: 14 }, "s");
  b.anchor("relax", { x: 31, y: 14 }, "s");
  b.place("furniture/armchair", { x: 35, y: 14 }, 1, 1, false);
  b.anchor("sleep", { x: 35, y: 14 }, "s");
  b.place("furniture/plant", { x: 37, y: 13 }, 1, 2);
  b.place("furniture/bookshelf", { x: 28, y: 18 }, 2, 2);
  // Smoking room (right middle).
  b.wallRect(33, 8, 7, 5);
  b.door(33, 10);
  b.floorRect(34, 9, 5, 3, "tiles/floor-kitchen");
  b.place("furniture/ashtray-stand", { x: 36, y: 9 }, 1, 2);
  b.anchor("smoke", { x: 36, y: 11 }, "n");
  // Open floor wander spots.
  for (const p of [
    { x: 8, y: 9 },
    { x: 14, y: 7 },
    { x: 18, y: 10 },
    { x: 22, y: 6 },
    { x: 28, y: 10 },
    { x: 12, y: 11 },
  ]) {
    b.anchor("wander", p, "s");
  }
  return b.t;
}

export function projectTemplate(id: string, name: string, desks = 8): FloorTemplate {
  const b = new Builder(id, name, W, H, "tiles/floor-carpet");
  b.elevator(1, 9);
  const perRow = 4;
  for (let i = 0; i < desks; i += 1) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    b.desk(8 + col * 6, 6 + row * 7);
  }
  b.place("furniture/whiteboard", { x: 18, y: 1 }, 2, 2);
  b.anchor("whiteboard", { x: 19, y: 3 }, "n");
  b.place("furniture/printer", { x: 3, y: 1 }, 1, 1);
  b.place("furniture/plant", { x: 5, y: 1 }, 1, 2);
  // Kitchenette (top right).
  b.wallRect(32, 0, 8, 7);
  b.door(32, 3);
  b.floorRect(33, 1, 6, 5, "tiles/floor-kitchen");
  b.place("furniture/coffee-machine", { x: 36, y: 1 }, 1, 2, true, "idle");
  b.anchor("coffee", { x: 36, y: 3 }, "n");
  b.place("furniture/water-cooler", { x: 34, y: 1 }, 1, 2);
  b.place("furniture/sink", { x: 38, y: 1 }, 1, 1);
  // Toilet (bottom right).
  b.wallRect(33, 16, 7, 6);
  b.door(33, 18);
  b.floorRect(34, 17, 5, 4, "tiles/floor-kitchen");
  b.place("furniture/toilet", { x: 36, y: 17 }, 1, 1);
  b.anchor("restroom", { x: 36, y: 18 }, "n");
  // Relax corner (bottom left).
  b.place("furniture/sofa", { x: 3, y: 18 }, 2, 1, false);
  b.anchor("relax", { x: 3, y: 18 }, "s");
  b.anchor("relax", { x: 4, y: 18 }, "s");
  b.place("furniture/plant", { x: 6, y: 17 }, 1, 2);
  b.place("furniture/bookshelf", { x: 28, y: 18 }, 2, 2);
  for (const p of [
    { x: 6, y: 10 },
    { x: 14, y: 3 },
    { x: 26, y: 10 },
    { x: 20, y: 18 },
    { x: 30, y: 4 },
  ]) {
    b.anchor("wander", p, "s");
  }
  return b.t;
}

/** Walkability from walls and blocking furniture. */
export function gridFor(template: FloorTemplate): Grid {
  const grid = new Grid(template.width, template.height);
  for (let y = 0; y < template.height; y += 1) {
    for (let x = 0; x < template.width; x += 1) {
      if (
        template.walls[y * template.width + x] === 1 ||
        template.floor[y * template.width + x] === null
      ) {
        grid.setWalkable({ x, y }, false);
      }
    }
  }
  for (const f of template.furniture) {
    if (f.blocks) {
      grid.fill(f.at.x, f.at.y, f.w, f.h, false);
    }
  }
  return grid;
}
