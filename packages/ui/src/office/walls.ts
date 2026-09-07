/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import type { PlanRect } from "@ho/sim";
import { type Container, type Graphics, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import { PALETTE, TILE } from "./stand-ins.ts";

type WallClass = "cap-h" | "cap-v" | "face" | "block";
const WALL_CLASSES: readonly WallClass[] = ["block", "face", "cap-h", "cap-v"];
/** Delivered wall tiles by class (assets/README.md, “Walls”); missing ones fall back to flat shapes. */
const WALL_TILE: Record<WallClass, string> = {
  "cap-h": "tiles/wall-cap-h",
  "cap-v": "tiles/wall-cap-v",
  face: "tiles/wall-face",
  block: "tiles/wall-block",
};
/** Width of a cap tile's outline zone in px: the dark edge line and the sliver of bevel beside it. */
const EDGE = 3;

export type WallGrid = {
  walls: Uint8Array;
  glass: readonly PlanRect[];
  width: number;
  height: number;
};
/** Which neighbours a cap cell continues into (other cap cells). */
type Links = { n: boolean; e: boolean; s: boolean; w: boolean };

/**
 * Walls as painted in the reference. Every wall cell is classified, then each class is drawn either from a
 * delivered seamless tile (`tiles/wall-*`, repeated along the run) or from the flat palette fallback:
 *   cap-h  — top of a horizontal wall (grey cap);
 *   face   — the light wall face: the floor row right under a horizontal wall, and the bottom row of a thick block;
 *   block  — inner rows of a thick block (the elevator shaft);
 *   cap-v  — a vertical wall band, including the outer columns of a thick block. Where a vertical wall leaves a
 *            horizontal one the band runs straight from the cap (the face is only ever drawn over floor).
 */
function classifyWalls(grid: WallGrid): Map<number, WallClass> {
  const { walls, glass, width, height } = grid;
  const isGlass = (x: number, y: number): boolean =>
    glass.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  const isWall = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && walls[y * width + x] === 1;
  const horizontalWall = (x: number, y: number): boolean =>
    isWall(x, y) && (isWall(x - 1, y) || isWall(x + 1, y));
  const classes = new Map<number, WallClass>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWall(x, y) || isGlass(x, y)) {
        continue;
      }
      const horizontal = horizontalWall(x, y);
      const underHorizontal = horizontalWall(x, y - 1) && !isGlass(x, y - 1);
      const id = y * width + x;
      if (horizontal && underHorizontal) {
        // Inside a thick block; its outer columns (floor or the map edge beside them) are vertical bands.
        const edge = !isWall(x - 1, y) || !isWall(x + 1, y);
        const inner = y + 1 < height && horizontalWall(x, y + 1) ? "block" : "face";
        classes.set(id, edge ? "cap-v" : inner);
      } else if (horizontal) {
        classes.set(id, "cap-h");
        if (y + 1 < height && !isWall(x, y + 1)) {
          classes.set(id + width, "face");
        }
      } else {
        classes.set(id, "cap-v");
      }
    }
  }
  return classes;
}

const isCap = (cls: WallClass | undefined): boolean => cls === "cap-h" || cls === "cap-v";

/**
 * Neighbouring cap cells this cell joins. A join needs one of the two cells to run in that direction (a horizontal
 * cap for east/west, a vertical band for north/south): two parallel bands side by side — the outer wall next to a
 * toilet stall — stay separate.
 */
function linksOf(classes: Map<number, WallClass>, grid: WallGrid, x: number, y: number): Links {
  const self = classes.get(y * grid.width + x);
  const at = (dx: number, dy: number, along: WallClass): boolean => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) {
      return false;
    }
    const other = classes.get(ny * grid.width + nx);
    return isCap(other) && (other === along || self === along);
  };
  return {
    n: at(0, -1, "cap-v"),
    e: at(1, 0, "cap-h"),
    s: at(0, 1, "cap-v"),
    w: at(-1, 0, "cap-h"),
  };
}

/** A cell continues a vertical run when the band passes through it or ends here without any horizontal cap. */
const verticalBase = (l: Links): boolean => (l.n && l.s) || (!l.e && !l.w && (l.n || l.s));
/** Straight pieces are drawn as runs of the plain tile; everything else (ends, corners, T's) is composed. */
const straight = (l: Links): boolean =>
  (l.n && l.s && !l.e && !l.w) || (l.e && l.w && !l.n && !l.s);

/** Tile phase for a cell so that runs and composed cells sample the same texels; whole cells only. */
const phase = (p: number, size: number): number => ((p % size) + TILE <= size ? p % size : 0);

function frame(texture: Texture, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source: texture.source, frame: new Rectangle(x, y, w, h) });
}

/**
 * A junction cell composed from the two straight cap tiles, the way the reference paints them: the caps merge into
 * one surface and the dark outline runs only around the outside. The base is the vertical or the horizontal tile;
 * every connected side loses its outline zone (filled with the other tile's body so the bands flow into each
 * other) and every open side gets the other tile's outline as an end cap. The corner pixels stay dark.
 */
function drawJoint(
  layer: Container,
  caps: { h: Texture; v: Texture },
  px: number,
  py: number,
  l: Links,
): void {
  const fx = phase(px, caps.h.width);
  const fy = phase(py, caps.v.height);
  const inner = TILE - 2 * EDGE;
  const put = (
    t: Texture,
    sx: number,
    sy: number,
    w: number,
    h: number,
    dx: number,
    dy: number,
  ): void => {
    const sprite = new Sprite(frame(t, sx, sy, w, h));
    sprite.position.set(px + dx, py + dy);
    layer.addChild(sprite);
  };
  if (verticalBase(l)) {
    put(caps.v, 0, fy, TILE, TILE, 0, 0);
    if (l.w) {
      put(caps.h, fx, 0, EDGE, TILE, 0, 0);
    }
    if (l.e) {
      put(caps.h, fx + TILE - EDGE, 0, EDGE, TILE, TILE - EDGE, 0);
    }
    if (!l.n) {
      put(caps.h, fx + EDGE, 0, inner, EDGE, EDGE, 0);
    }
    if (!l.s) {
      put(caps.h, fx + EDGE, TILE - EDGE, inner, EDGE, EDGE, TILE - EDGE);
    }
    return;
  }
  put(caps.h, fx, 0, TILE, TILE, 0, 0);
  if (l.n) {
    put(caps.v, EDGE, fy, inner, EDGE, EDGE, 0);
  }
  if (l.s) {
    put(caps.v, EDGE, fy + TILE - EDGE, inner, EDGE, EDGE, TILE - EDGE);
  }
  if (!l.w) {
    put(caps.v, 0, fy, EDGE, TILE, 0, 0);
  }
  if (!l.e) {
    put(caps.v, TILE - EDGE, fy, EDGE, TILE, TILE - EDGE, 0);
  }
}

/** One run of wall cells: the delivered tile repeated with a global phase, or the flat stand-in. */
function drawWallRun(
  layer: Container,
  g: Graphics,
  cls: WallClass,
  texture: Texture | undefined,
  r: PlanRect,
): void {
  if (texture === undefined) {
    fallbackWall(g, cls, r.x, r.y, r.w, r.h);
    return;
  }
  const tiles = new TilingSprite({ texture, x: r.x, y: r.y, width: r.w, height: r.h });
  // Keep the pattern phase global so neighbouring runs continue each other seamlessly.
  tiles.tilePosition.set(-(r.x % texture.width), -(r.y % texture.height));
  layer.addChild(tiles);
}

/** Flat-colour stand-in for a wall run of one class. */
function fallbackWall(
  g: Graphics,
  cls: WallClass,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  switch (cls) {
    case "cap-h":
      g.rect(x, y, w, h).fill(PALETTE.wallCap);
      break;
    case "face":
      g.rect(x, y, w, h)
        .fill(PALETTE.wallFace)
        .rect(x, y + h - 3, w, 3)
        .fill(PALETTE.wallEdge);
      break;
    case "block":
      g.rect(x, y, w, h).fill(PALETTE.wallFace);
      break;
    case "cap-v":
      g.rect(x, y, w, h)
        .fill(PALETTE.wallCap)
        .rect(x, y, 2, h)
        .fill(PALETTE.wallOuter)
        .rect(x + w - 2, y, 2, h)
        .fill(PALETTE.wallOuter);
      break;
  }
}

/** Every wall cell: straight runs from the tiles (or flat fallbacks into `g`), junction cells composed on top. */
export function drawWalls(
  layer: Container,
  g: Graphics,
  grid: WallGrid,
  floorTexture: (key: string) => Texture | undefined,
): void {
  const { width, height } = grid;
  const classes = classifyWalls(grid);
  const runs = new Map<number, WallClass>();
  const joints = new Map<number, Links>();
  for (const [id, cls] of classes) {
    if (!isCap(cls)) {
      runs.set(id, cls);
      continue;
    }
    const links = linksOf(classes, grid, id % width, Math.floor(id / width));
    if (straight(links)) {
      runs.set(id, verticalBase(links) ? "cap-v" : "cap-h");
    } else {
      joints.set(id, links);
    }
  }
  for (const cls of WALL_CLASSES) {
    const texture = floorTexture(WALL_TILE[cls]);
    const vertical = cls === "cap-v";
    const outer = vertical ? width : height;
    const inner = vertical ? height : width;
    for (let o = 0; o < outer; o += 1) {
      let run = -1;
      for (let i = 0; i <= inner; i += 1) {
        const x = vertical ? o : i;
        const y = vertical ? i : o;
        const here = i < inner && runs.get(y * width + x) === cls;
        if (here && run < 0) {
          run = i;
        } else if (!here && run >= 0) {
          const length = i - run;
          drawWallRun(layer, g, cls, texture, {
            x: (vertical ? o : run) * TILE,
            y: (vertical ? run : o) * TILE,
            w: (vertical ? 1 : length) * TILE,
            h: (vertical ? length : 1) * TILE,
          });
          run = -1;
        }
      }
    }
  }
  const capH = floorTexture(WALL_TILE["cap-h"]);
  const capV = floorTexture(WALL_TILE["cap-v"]);
  for (const [id, links] of joints) {
    const px = (id % width) * TILE;
    const py = Math.floor(id / width) * TILE;
    if (capH === undefined || capV === undefined) {
      fallbackWall(g, verticalBase(links) ? "cap-v" : "cap-h", px, py, TILE, TILE);
    } else {
      drawJoint(layer, { h: capH, v: capV }, px, py, links);
    }
  }
}
