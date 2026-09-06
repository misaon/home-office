/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import { CELL_PX, type PlanObject, type PlanRect, type PlanRoom } from "@ho/sim";
import { Container, Graphics, Text } from "pixi.js";

/** Pixels per cell on the stage: the art density every sprite is delivered at. */
export const TILE = CELL_PX;

/** Approved palette (docs/OFFICE-ART.md): warm orange floors, teal furniture, dark wall caps. */
const PALETTE = {
  corridor: 0xb88150,
  carpet: 0x315e5b,
  tile: 0xb7a48a,
  wood: 0x9c6743,
  wallFace: 0x333b3b,
  wallCap: 0xddd0b0,
  teal: 0x246a61,
  wood2: 0x805d38,
  trim: 0xd9af70,
  label: "#f2ddbe",
} as const;

const label = (
  text: string,
  x: number,
  y: number,
  color: string = PALETTE.label,
  size = 10,
): Text =>
  new Text({
    text,
    x,
    y,
    resolution: 2,
    style: { fontFamily: "monospace", fontSize: size, fill: color, fontWeight: "bold" },
  });

const surfaceColor = (room: PlanRoom): number =>
  room.surface === "wood"
    ? PALETTE.wood
    : room.surface === "tile"
      ? PALETTE.tile
      : room.surface === "carpet"
        ? PALETTE.carpet
        : PALETTE.corridor;

/** Floor fills per room and walls with a lit cap; glass cells are left to `glassWall`. Cached once per floor. */
export function architecture(
  rooms: readonly PlanRoom[],
  glass: readonly PlanRect[],
  walls: Uint8Array,
  width: number,
  height: number,
): Container {
  const layer = new Container();
  const g = new Graphics().rect(0, 0, width * TILE, height * TILE).fill(PALETTE.corridor);
  for (const r of rooms) {
    g.rect((r.x + 1) * TILE, (r.y + 1) * TILE, (r.w - 2) * TILE, (r.h - 2) * TILE).fill(
      surfaceColor(r),
    );
  }
  const isGlass = (x: number, y: number): boolean =>
    glass.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  const isWall = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && walls[y * width + x] === 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWall(x, y) || isGlass(x, y)) {
        continue;
      }
      const horizontal = isWall(x - 1, y) || isWall(x + 1, y);
      g.rect(x * TILE, y * TILE, TILE, TILE).fill(PALETTE.wallFace);
      if (horizontal) {
        g.rect(x * TILE, y * TILE + 10, TILE, 6).fill(PALETTE.wallCap);
      } else {
        g.rect(x * TILE + 10, y * TILE, 6, TILE).fill(PALETTE.wallCap);
      }
    }
  }
  layer.addChild(g);
  for (const r of rooms) {
    const labelX = r.x + (r.id === "toilets" ? 10 : 1);
    layer.addChild(
      label(r.label, labelX * TILE + 4, (r.y + 1) * TILE + 3, PALETTE.label, r.w < 6 ? 7 : 10),
    );
  }
  return layer;
}

/** Fixed full-height glazing, sorted in front of people standing behind it. */
export function glassWall(pane: PlanRect): Graphics {
  const height = 3 * TILE;
  const width = pane.w * TILE;
  const bottom = (pane.y + pane.h) * TILE;
  const g = new Graphics({ x: pane.x * TILE, y: bottom - height, zIndex: bottom - 1 });
  g.rect(0, 0, width, height).fill({ color: 0x8de0df, alpha: 0.35 });
  for (let x = 0; x < width; x += 2 * TILE) {
    const panel = Math.min(2 * TILE, width - x);
    g.rect(x, 0, 3, height)
      .fill(0x335d6b)
      .moveTo(x + 6, height - 8)
      .lineTo(x + panel - 6, 8)
      .stroke({ color: 0xd7ffff, width: 2, alpha: 0.65 });
  }
  g.rect(0, 0, width, 3)
    .fill(0x335d6b)
    .rect(0, height - 4, width, 4)
    .fill(0x335d6b)
    .rect(width - 3, 0, 3, height)
    .fill(0x335d6b);
  return g;
}

function desk(g: Graphics, f: PlanObject): void {
  const w = f.w * TILE;
  const h = f.h * TILE;
  g.rect(2, h - 7, w - 4, 8)
    .fill(0x4c3526)
    .rect(0, -7, w, h)
    .fill(0x744c2f)
    .rect(2, -5, w - 4, h - 4)
    .fill(0xc99a59);
  const monitorY = f.facing === "s" ? h - 19 : -8;
  const keyboardY = f.facing === "s" ? 0 : h - 17;
  g.rect(17, monitorY, 27, 13)
    .fill(0x182c35)
    .rect(20, monitorY + 2, 21, 8)
    .fill(f.facing === "s" ? 0x243840 : 0x467f98)
    .rect(19, keyboardY, 22, 6)
    .fill(0xddd2bd)
    .rect(w - 10, 4, 5, 6)
    .fill(0xf8deb0);
}

/** Geometric stand-in for an object whose sprite has not been delivered yet; keyed by the sprite name. */
export function standIn(f: PlanObject): Container {
  const root = new Container({ x: f.at.x * TILE, y: f.at.y * TILE });
  root.zIndex = (f.at.y + f.h) * TILE - (f.blocks ? 1 : 3);
  const g = new Graphics();
  const w = f.w * TILE;
  const h = f.h * TILE;
  const kind = f.sprite.slice("furniture/".length);
  if (kind.startsWith("chair")) {
    g.rect(1, 4, 14, 11).fill(0x152e30).rect(2, 2, 12, 9).fill(0x478b80);
  } else if (kind.startsWith("desk")) {
    desk(g, f);
  } else if (kind === "hot-tub") {
    g.rect(0, 0, w, h)
      .fill(0x593d2c)
      .rect(4, 4, w - 8, h - 8)
      .fill(0x9dccdf)
      .rect(9, 9, w - 18, h - 18)
      .fill(0x3aa7c2);
  } else if (kind === "elevator") {
    g.rect(0, 0, w, h)
      .fill(0x253238)
      .rect(8, 8, w - 16, h - 16)
      .fill(0x55666c);
  } else if (kind === "foosball") {
    g.rect(0, 0, w, h)
      .fill(0x553c24)
      .rect(5, 5, w - 10, h - 10)
      .fill(0x35724f);
    for (let i = 0; i < 8; i += 1) {
      const y = 9 + i * 9;
      g.rect(-3, y, w + 6, 2)
        .fill(0xa9b9b9)
        .rect(i % 2 === 0 ? -9 : w + 3, y - 1, 6, 4)
        .fill(0x1b292c);
    }
  } else if (kind === "mailbox") {
    g.rect(2, 2, 12, 12).fill(0x8b3a2f).rect(4, 5, 8, 3).fill(0xf8deb0);
  } else {
    g.rect(2, 4, w, h)
      .fill({ color: 0x101e24, alpha: 0.3 })
      .rect(0, 0, w, h)
      .fill(kind.startsWith("sofa") ? PALETTE.teal : PALETTE.wood2)
      .rect(2, 2, w - 4, h - 4)
      .stroke({ color: PALETTE.trim, width: 1 });
  }
  root.addChild(g);
  if (f.label.length > 0) {
    const text = label(f.label, w / 2, h / 2, "#fff2d7", w < 40 ? 6 : 8);
    text.anchor.set(0.5);
    root.addChild(text);
  }
  return root;
}
