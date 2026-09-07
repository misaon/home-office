/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import { type PlanRect, type PlanRoom, SURFACE_TILE } from "@ho/sim";
import { Container, Graphics, type Texture, TilingSprite } from "pixi.js";
import { label, PALETTE, SURFACES, surfaceColor, TILE } from "./stand-ins.ts";

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
  layer.addChild(new Graphics().rect(0, 0, width * TILE, height * TILE).fill(PALETTE.wallFace));
  for (const surface of SURFACES) {
    const key = SURFACE_TILE[surface];
    // Horizontal runs of this surface's floor cells (walls excluded), as one Graphics.
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
      layer.addChild(cells.fill(surfaceColor(surface)));
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
  const isFloor = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && walls[y * width + x] !== 1;
  // Walls as painted in the reference: a dark cap on the wall line and, on horizontal runs, a light face one and
  // a half cells tall hanging below it (over the room's first row); vertical runs are a dark band with a lit edge.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWall(x, y) || isGlass(x, y)) {
        continue;
      }
      const px0 = x * TILE;
      const py0 = y * TILE;
      const horizontal = isWall(x - 1, y) || isWall(x + 1, y);
      if (horizontal && isFloor(x, y + 1)) {
        g.rect(px0, py0, TILE, TILE * 0.55).fill(PALETTE.wallCap);
        g.rect(px0, py0 + TILE * 0.55, TILE, TILE * 1.45).fill(PALETTE.wallFace);
        g.rect(px0, py0 + TILE * 1.9, TILE, TILE * 0.1).fill(PALETTE.wallEdge);
      } else if (horizontal) {
        g.rect(px0, py0, TILE, TILE).fill(PALETTE.wallCap);
      } else {
        g.rect(px0, py0, TILE, TILE).fill(PALETTE.wallCap);
        g.rect(px0 + TILE - 4, py0, 4, TILE).fill(PALETTE.wallFace);
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
