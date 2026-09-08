import { CELL_PX, type PlanObject, type Surface } from "@ho/sim";
import { Container, Graphics, Text } from "pixi.js";

/** Pixels per cell on the stage: the art density every sprite is delivered at. */
export const TILE = CELL_PX;

/** Approved palette (docs/OFFICE-ART.md): warm orange floors, teal furniture, dark wall caps. */
export const PALETTE = {
  // Sampled from the approved reference (medians of clean regions).
  corridor: 0xd06c20,
  carpet: 0x21665b,
  rugGreen: 0x62613b,
  rugBeige: 0xbf8045,
  tile: 0xd06c20,
  wood: 0xc16019,
  // Wall colours match the wall piece painted into the elevator sprite, so the shaft blends into our walls.
  wallFace: 0xf1be7b,
  wallCap: 0x676768,
  wallOuter: 0x676768,
  wallEdge: 0x977250,
  teal: 0x246a61,
  wood2: 0x805d38,
  trim: 0xd9af70,
  label: "#f2ddbe",
} as const;

export const label = (
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

export const surfaceColor = (surface: Surface): number =>
  surface === "wood" ? PALETTE.wood : surface === "tile" ? PALETTE.tile : PALETTE.corridor;

/** Floor fills per room and walls with a lit cap; glass cells are left to `glassWall`. Cached once per floor. */
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
/** Stand-in shapes for decor and small props; false when `kind` is not one of them. */
function decorStandIn(g: Graphics, kind: string, f: PlanObject, w: number, h: number): boolean {
  const cx = w / 2;
  if (kind.includes("chair")) {
    // Seat and backrest, centred on the footprint (chair art is wider than its seat cell).
    const cw = Math.max(w, (f.artWidth ?? 1) * TILE);
    g.roundRect(cx - cw / 2 + 2, h * 0.35, cw - 4, h * 0.6, 3)
      .fill(0x152e30)
      .roundRect(cx - cw / 2 + 4, 2, cw - 8, h * 0.5, 3)
      .fill(0x478b80);
  } else if (kind.startsWith("plant")) {
    // Pot on the footprint, foliage above it as wide as the art.
    const r =
      f.artHeight === undefined ? ((f.artWidth ?? f.w) * TILE) / 2 : (f.artHeight * TILE) / 3;
    g.rect(cx - w * 0.3, h - 8, w * 0.6, 8)
      .fill(0x8d8d8d)
      .circle(cx, h - 8 - r * 0.6, r * 0.9)
      .fill(0x2f7a3a);
  } else if (
    kind.startsWith("picture") ||
    kind === "picture-tall" ||
    kind === "window" ||
    kind === "aquarium" ||
    kind === "wall-screen" ||
    kind === "wall-shelf" ||
    kind === "radiator"
  ) {
    // Wall decor: a framed panel, no floor shadow.
    const fill =
      kind === "window" || kind === "aquarium"
        ? 0x7fc4e0
        : kind === "wall-screen"
          ? 0x223038
          : 0xc9b48a;
    g.rect(0, 0, w, h)
      .fill(0x4a3a2a)
      .rect(2, 2, w - 4, h - 4)
      .fill(fill);
  } else if (kind === "backsplash") {
    g.rect(0, 0, w, h).fill(0xd9cfc2);
    for (let yy = 0; yy < h; yy += 8) {
      for (let xx = (yy / 8) % 2 === 0 ? 0 : 6; xx < w; xx += 12) {
        g.rect(xx + 1, yy + 1, 10, 6).fill(0xeae2d6);
      }
    }
  } else if (kind === "string-lights") {
    g.rect(0, 2, w, 1).fill(0x3a2a1a);
    for (let xx = 8; xx < w; xx += 30) {
      g.rect(xx, 2, 2, 8)
        .fill(0x3a2a1a)
        .circle(xx + 1, 13, 3)
        .fill(0xffc24a);
    }
  } else if (kind === "railing") {
    g.rect(0, 6, w, h - 8)
      .fill({ color: 0x8de0df, alpha: 0.35 })
      .rect(0, 4, w, 3)
      .fill(0x8a9296);
    for (let xx = 0; xx <= w - 6; xx += 96) {
      g.rect(xx, 0, 6, h).fill(0x6a7276);
    }
  } else if (kind === "dartboard") {
    g.circle(cx, h / 2, Math.min(w, h) / 2)
      .fill(0x4a3a2a)
      .circle(cx, h / 2, Math.min(w, h) / 2 - 3)
      .fill(0xe8e0c8);
  } else if (kind === "floor-lamp") {
    g.rect(cx - 2, 0, 4, h)
      .fill(0x8a7a40)
      .circle(cx, 4, 8)
      .fill(0xf2c85a);
  } else if (kind.startsWith("rug")) {
    const color =
      kind === "rug-green"
        ? PALETTE.rugGreen
        : kind === "rug-beige"
          ? PALETTE.rugBeige
          : PALETTE.carpet;
    g.rect(0, 0, w, h)
      .fill(color)
      .rect(2, 2, w - 4, h - 4)
      .stroke({ color: 0xffffff, alpha: 0.12, width: 2 });
  } else if (kind === "hedge" || kind === "bushes") {
    g.roundRect(0, 0, w, h, 6).fill(0x2f7a3a);
  } else if (kind === "bin") {
    g.rect(3, 2, w - 6, h - 2).fill(0x7a7f80);
  } else {
    return false;
  }
  return true;
}

/** Stand-in shapes for furniture with a recognisable silhouette; false when `kind` is not one of them. */
function furnitureStandIn(g: Graphics, kind: string, f: PlanObject, w: number, h: number): boolean {
  if (kind.startsWith("desk")) {
    desk(g, f);
  } else if (kind === "hot-tub") {
    g.rect(0, 0, w, h)
      .fill(0x593d2c)
      .rect(4, 4, w - 8, h - 8)
      .fill(0x9dccdf)
      .rect(9, 9, w - 18, h - 18)
      .fill(0x3aa7c2);
  } else if (kind === "elevator-cabin") {
    g.rect(0, 0, w, h)
      .fill(0x253238)
      .rect(8, 8, w - 16, h - 8)
      .fill(0x55666c);
  } else if (kind === "elevator-frame") {
    g.rect(0, 0, w, 8)
      .fill(0x253238)
      .rect(0, 0, 8, h)
      .fill(0x253238)
      .rect(w - 8, 0, 8, h)
      .fill(0x253238);
  } else if (kind === "elevator-doors") {
    const leaf = (w - 16) / 2 - 2;
    g.rect(8, 8, leaf, h - 8)
      .fill(0x8a949a)
      .rect(w / 2 + 2, 8, leaf, h - 8)
      .fill(0x8a949a);
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
    return false;
  }
  return true;
}

export function standIn(f: PlanObject): Container {
  const root = new Container({ x: f.at.x * TILE, y: (f.at.y + (f.artOffsetY ?? 0)) * TILE });
  root.zIndex = (f.at.y + f.h) * TILE - (f.blocks ? 1 : 3);
  const g = new Graphics();
  const w = f.w * TILE;
  const h = f.h * TILE;
  const kind = f.sprite.slice("furniture/".length);
  if (!decorStandIn(g, kind, f, w, h) && !furnitureStandIn(g, kind, f, w, h)) {
    // Anything else: a wooden box with the object's label.
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
