/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */
import type { OfficePlan, PlanObject } from "@ho/sim";
import { Container, Graphics, Text } from "pixi.js";

export const TILE = 16;
export const label = (text: string, x: number, y: number, color = "#f8e4c4", size = 10): Text =>
  new Text({
    text,
    x,
    y,
    resolution: 2,
    style: { fontFamily: "monospace", fontSize: size, fill: color, fontWeight: "bold" },
  });

/** Geometric stand-ins, deliberately separate from the approved production art. */
export function architecture(plan: OfficePlan): Container {
  const layer = new Container();
  const g = new Graphics().rect(0, 0, 80 * TILE, 46 * TILE).fill(0xb88150);
  for (const r of plan.rooms) {
    g.rect((r.x + 1) * TILE, (r.y + 1) * TILE, (r.w - 2) * TILE, (r.h - 2) * TILE).fill(
      r.surface === "wood" ? 0x9c6743 : r.surface === "tile" ? 0xb7a48a : 0x315e5b,
    );
    layer.addChild(
      label(r.label, (r.x + 1) * TILE + 4, (r.y + 1) * TILE + 3, "#f2ddbe", r.w < 6 ? 7 : 10),
    );
  }
  for (let y = 0; y < plan.template.height; y += 1) {
    for (let x = 0; x < plan.template.width; x += 1) {
      if (plan.template.walls[y * plan.template.width + x] === 1) {
        const horizontal =
          (x > 0 && plan.template.walls[y * plan.template.width + x - 1] === 1) ||
          (x < plan.template.width - 1 &&
            plan.template.walls[y * plan.template.width + x + 1] === 1);
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(0x333b3b);
        if (horizontal) {
          g.rect(x * TILE, y * TILE + 10, TILE, 6).fill(0xddd0b0);
        } else {
          g.rect(x * TILE + 10, y * TILE, 6, TILE).fill(0xddd0b0);
        }
      }
    }
  }
  for (const glass of plan.glass) {
    g.rect(glass.x * TILE, glass.y * TILE, glass.w * TILE, 16).fill(0x335d6b);
    for (let x = glass.x; x < glass.x + glass.w; x += 2) {
      g.rect(x * TILE + 2, glass.y * TILE + 2, 28, 11).fill({ color: 0x8de0df, alpha: 0.65 });
    }
  }
  layer.addChildAt(g, 0);
  layer.addChild(label("HLAVNÍ CHODBA · 4 POLE", 18 * TILE, 17 * TILE, "#543824", 9));
  return layer;
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

export function furniture(f: PlanObject): Container {
  const root = new Container({ x: f.at.x * TILE, y: f.at.y * TILE });
  root.zIndex = (f.at.y + f.h) * TILE - (f.blocks ? 1 : 3);
  const g = new Graphics();
  const w = f.w * TILE;
  const h = f.h * TILE;
  if (f.id.endsWith("-chair")) {
    g.rect(1, 4, 14, 11).fill(0x152e30).rect(2, 2, 12, 9).fill(0x478b80);
  } else if (f.sprite === "furniture/desk-monitor" && w >= 64) {
    desk(g, f);
  } else if (f.id === "hot-tub") {
    g.rect(0, 0, w, h)
      .fill(0x593d2c)
      .rect(4, 4, w - 8, h - 8)
      .fill(0x9dccdf)
      .rect(9, 9, w - 18, h - 18)
      .fill(0x3aa7c2);
  } else if (f.id === "lift-shaft") {
    g.rect(0, 0, w, h)
      .fill(0x253238)
      .rect(8, 8, w - 16, h - 16)
      .fill(0x55666c);
  } else if (f.id === "foosball") {
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
  } else {
    g.rect(2, 4, w, h)
      .fill({ color: 0x101e24, alpha: 0.3 })
      .rect(0, 0, w, h)
      .fill(f.id === "sofa" ? 0x246a61 : 0x805d38)
      .rect(2, 2, w - 4, h - 4)
      .stroke({ color: 0xd9af70, width: 1 });
  }
  root.addChild(g);
  if (f.label.length > 0) {
    const text = label(f.label, w / 2, h / 2, "#fff2d7", w < 40 ? 6 : 8);
    text.anchor.set(0.5);
    root.addChild(text);
  }
  return root;
}
