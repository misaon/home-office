// Drawing helpers for the placeholder sprite generator (native resolution, 16×16 tiles, 32×32 characters).
import { blank, fillRect, type Rgba, setPixel } from "../png.ts";

export type Entry = { key: string; animation: string; frames: Rgba[] };

export type Color = readonly [number, number, number, number];
export const c = (hex: string, a = 255): Color => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
  a,
];
export const OUTLINE = c("#2b2b3a");

const outline = (
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color = OUTLINE,
): void => {
  fillRect(img, x, y, w, 1, color);
  fillRect(img, x, y + h - 1, w, 1, color);
  fillRect(img, x, y, 1, h, color);
  fillRect(img, x + w - 1, y, 1, h, color);
};
export const box = (
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Color,
  edge: Color = OUTLINE,
): void => {
  fillRect(img, x, y, w, h, fill);
  outline(img, x, y, w, h, edge);
};

export type Palette = { skin: Color; hair: Color; shirt: Color; pants: Color; shoes: Color };
export type Dir = "s" | "n" | "e";
export type Pose = {
  legOffset?: [number, number];
  armsFront?: boolean;
  armsUp?: boolean;
  armRight?: boolean;
  armLeft?: boolean;
  sitting?: boolean;
  headDown?: boolean;
  cup?: boolean;
  bodyDy?: number;
};

export function character(p: Palette, dir: Dir, pose: Pose = {}): Rgba {
  const img = blank(32, 32);
  const dy = pose.bodyDy ?? 0;
  const headY = (pose.headDown === true ? 10 : 6) + dy;
  const bodyY = 14 + dy;
  const legY = pose.sitting === true ? 24 + dy : 24 + dy;
  const legH = pose.sitting === true ? 4 : 6;
  // legs + shoes (feet on row 30)
  const [lo, ro] = pose.legOffset ?? [0, 0];
  box(img, 12, legY + lo, 4, legH - lo, p.pants);
  box(img, 17, legY + ro, 4, legH - ro, p.pants);
  fillRect(img, 12, 29, 4, 2, p.shoes);
  fillRect(img, 17, 29, 4, 2, p.shoes);
  // body
  box(img, 11, bodyY, 11, 10, p.shirt);
  // arms
  if (pose.armsUp === true) {
    box(img, 8, bodyY - 3, 3, 8, p.skin);
    box(img, 22, bodyY - 3, 3, 8, p.skin);
  } else if (pose.armsFront === true) {
    box(img, 10, bodyY + 5, 13, 3, p.skin);
  } else if (pose.armRight === true) {
    box(img, 21, bodyY + 3, 7, 3, p.skin);
  } else if (pose.armLeft === true) {
    box(img, 5, bodyY + 3, 7, 3, p.skin);
  } else {
    box(img, 9, bodyY + 1, 3, 7, p.skin);
    box(img, 21, bodyY + 1, 3, 7, p.skin);
  }
  // head + hair
  box(img, 12, headY, 9, 9, p.skin);
  if (dir === "n") {
    fillRect(img, 12, headY, 9, 6, p.hair);
  } else {
    fillRect(img, 12, headY, 9, 3, p.hair);
    if (dir === "s") {
      setPixel(img, 14, headY + 5, OUTLINE);
      setPixel(img, 18, headY + 5, OUTLINE);
    } else {
      setPixel(img, 18, headY + 5, OUTLINE);
      fillRect(img, 12, headY, 3, 7, p.hair);
    }
  }
  if (pose.cup === true) {
    box(img, 22, bodyY + 2, 4, 4, c("#ffffff"));
  }
  return img;
}

export const tile = (fill: Color, decorate?: (img: Rgba) => void): Rgba => {
  const img = blank(16, 16);
  fillRect(img, 0, 0, 16, 16, fill);
  decorate?.(img);
  return img;
};

export const piece = (w: number, h: number, draw: (img: Rgba) => void): Rgba => {
  const img = blank(w, h);
  draw(img);
  return img;
};

export const bubble = (draw: (img: Rgba) => void): Rgba =>
  piece(16, 16, (img) => {
    box(img, 1, 1, 14, 11, c("#ffffff"));
    fillRect(img, 3, 12, 3, 2, c("#ffffff"));
    setPixel(img, 3, 14, OUTLINE);
    draw(img);
  });
