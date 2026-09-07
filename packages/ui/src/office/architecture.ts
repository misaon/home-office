/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import { type PlanGlass, type PlanRect, type PlanRoom, roomFloorKey, SURFACE_TILE } from "@ho/sim";
import { Container, Graphics, type Texture, TilingSprite } from "pixi.js";
import { label, PALETTE, surfaceColor, TILE } from "./stand-ins.ts";

type WallClass = "cap-h" | "cap-v" | "face" | "block";
const WALL_CLASSES: readonly WallClass[] = ["block", "face", "cap-h", "cap-v"];
/** Delivered wall tiles by class (assets/README.md, “Walls”); missing ones fall back to flat shapes. */
const WALL_TILE: Record<WallClass, string> = {
  "cap-h": "tiles/wall-cap-h",
  "cap-v": "tiles/wall-cap-v",
  face: "tiles/wall-face",
  block: "tiles/wall-block",
};

/** One run of wall cells: the delivered tile repeated with a global phase, or the flat stand-in. */
function drawWallRun(
  layer: Container,
  g: Graphics,
  cls: WallClass,
  texture: Texture | undefined,
  r: { x: number; y: number; w: number; h: number },
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

/**
 * Floors, walls and glass as one static layer. Floors are painted cell by cell from the template: every surface
 * gets one floor-spanning tile (the material `SURFACE_TILE` names for it, when delivered) masked to its cells, so
 * patterns stay continuous across rooms and corridors; surfaces without a tile get their flat palette colour.
 * Wall cells (glass included) keep the dark wall face underneath.
 */
export function architecture(
  rooms: readonly PlanRoom[],
  glass: readonly PlanRect[],
  walls: Uint8Array,
  width: number,
  height: number,
  floor: readonly (string | null)[],
  floorTexture: (key: string) => Texture | undefined,
): Container {
  const layer = new Container();
  layer.addChild(new Graphics().rect(0, 0, width * TILE, height * TILE).fill(PALETTE.wallCap));
  // One entry per floor key: the corridor's surface tile and one tile per room, each with its fallback colour.
  const keys = new Map<string, number>([[SURFACE_TILE.office, PALETTE.corridor]]);
  for (const room of rooms) {
    keys.set(roomFloorKey(room.id), surfaceColor(room.surface));
  }
  for (const [key, color] of keys) {
    // Horizontal runs of this key's floor cells (walls excluded), as one Graphics.
    const cells = new Graphics();
    let any = false;
    for (let y = 0; y < height; y += 1) {
      let run = -1;
      for (let x = 0; x <= width; x += 1) {
        const here = x < width && floor[y * width + x] === key && walls[y * width + x] !== 1;
        if (here && run < 0) {
          run = x;
        } else if (!here && run >= 0) {
          cells.rect(run * TILE, y * TILE, (x - run) * TILE, TILE);
          any = true;
          run = -1;
        }
      }
    }
    if (!any) {
      continue;
    }
    const texture = floorTexture(key);
    if (texture === undefined) {
      layer.addChild(cells.fill(color));
    } else {
      const tiles = new TilingSprite({ texture, width: width * TILE, height: height * TILE });
      tiles.mask = cells.fill(0xffffff);
      layer.addChild(tiles, cells);
    }
  }
  const g = new Graphics();
  const isGlass = (x: number, y: number): boolean =>
    glass.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  const isWall = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && walls[y * width + x] === 1;
  // Walls as painted in the reference. Every wall cell is classified, then each class is drawn either from a
  // delivered seamless tile (`tiles/wall-*`, repeated along the run) or from the flat palette fallback:
  //   cap-h  — top of a horizontal wall (grey cap);
  //   face   — the light wall face: the row under a horizontal wall (over the room's first row and across corners,
  //            where the vertical wall starts one row lower) and the bottom row of a thick block;
  //   block  — inner rows of a thick block (the elevator shaft);
  //   cap-v  — a vertical wall band.
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
        classes.set(id, y + 1 < height && horizontalWall(x, y + 1) ? "block" : "face");
      } else if (horizontal) {
        classes.set(id, "cap-h");
        if (y + 1 < height && !isWall(x, y + 1)) {
          classes.set(id + width, "face");
        }
      } else if (underHorizontal) {
        classes.set(id, "face");
      } else {
        classes.set(id, "cap-v");
      }
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
        const here = i < inner && classes.get(y * width + x) === cls;
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
  layer.addChild(g);
  for (const r of rooms) {
    const labelX = r.x + (r.id === "toilets" ? 10 : 1);
    layer.addChild(
      label(r.label, labelX * TILE + 4, (r.y + 1) * TILE + 3, PALETTE.label, r.w < 6 ? 7 : 10),
    );
  }
  return layer;
}

/**
 * Glazing. `wall`: full-height translucent panels rising three cells from the wall line (kitchen front).
 * `rail`: a low balustrade with posts on the terrace edge, horizontal along the south edge or vertical along the
 * east edge. Sorted in front of people standing behind it.
 */
export function glassWall(pane: PlanGlass): Graphics {
  const bottom = (pane.y + pane.h) * TILE;
  if (pane.kind === "rail") {
    const vertical = pane.h > pane.w;
    const width = pane.w * TILE;
    const height = pane.h * TILE;
    const g = new Graphics({ x: pane.x * TILE, y: pane.y * TILE, zIndex: bottom - 1 });
    if (vertical) {
      g.rect(6, 0, 12, height)
        .fill({ color: 0x8de0df, alpha: 0.35 })
        .rect(6, 0, 3, height)
        .fill(0x8a9296);
      for (let y = 0; y <= height - 6; y += 4 * TILE) {
        g.rect(4, y, 16, 6).fill(0x6a7276);
      }
    } else {
      g.rect(0, 6, width, 12)
        .fill({ color: 0x8de0df, alpha: 0.35 })
        .rect(0, 4, width, 3)
        .fill(0x8a9296);
      for (let x = 0; x <= width - 6; x += 4 * TILE) {
        g.rect(x, 0, 6, 18).fill(0x6a7276);
      }
    }
    return g;
  }
  const height = 3 * TILE;
  const width = pane.w * TILE;
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
