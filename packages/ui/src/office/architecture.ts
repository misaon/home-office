import { type PlanGlass, type PlanRect, type PlanRoom, roomFloorKey, SURFACE_TILE } from "@ho/sim";
import { Container, Graphics, type Texture, TilingSprite } from "pixi.js";
import { label, PALETTE, surfaceColor, TILE } from "./stand-ins.ts";
import { drawWalls } from "./walls.ts";

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
  drawWalls(layer, g, { walls, glass, width, height }, floorTexture);
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
