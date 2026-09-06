import { blank, fillRect, type Rgba } from "./png.ts";

type Color = readonly [number, number, number, number];
const INK: Color = [23, 26, 33, 255];
const WALL: Color = [62, 74, 94, 255];
const WALL_DARK: Color = [44, 53, 68, 255];
const ROOF: Color = [255, 209, 102, 255];
const WINDOW_LIT: Color = [255, 209, 102, 255];
const WINDOW_DARK: Color = [28, 34, 46, 255];
const DOOR: Color = [120, 80, 50, 255];
const SIGN: Color = [232, 232, 232, 255];

/** A 32×32 pixel-art office building on a rounded dark tile, the base for every icon size. */
export function drawIcon(): Rgba {
  const img = blank(32, 32);
  // Rounded tile: full square minus 2-pixel corner notches.
  fillRect(img, 2, 0, 28, 32, INK);
  fillRect(img, 0, 2, 32, 28, INK);
  fillRect(img, 1, 1, 30, 30, INK);
  // Building body with a darker right face.
  fillRect(img, 8, 7, 16, 21, WALL);
  fillRect(img, 21, 7, 3, 21, WALL_DARK);
  // Roof slab and a small rooftop box.
  fillRect(img, 7, 6, 18, 1, ROOF);
  fillRect(img, 14, 4, 4, 2, WALL_DARK);
  // Four floors of windows: lit in a pattern that reads as "people working late".
  const rows = [9, 13, 17, 21];
  const cols = [10, 13, 16, 19];
  const lit = new Set(["0-0", "0-2", "1-1", "1-3", "2-0", "2-1", "3-2", "3-3", "2-3"]);
  for (const [r, y] of rows.entries()) {
    for (const [c, x] of cols.entries()) {
      fillRect(img, x, y, 2, 2, lit.has(`${String(r)}-${String(c)}`) ? WINDOW_LIT : WINDOW_DARK);
    }
  }
  // Entrance with a sign above it.
  fillRect(img, 14, 25, 4, 3, DOOR);
  fillRect(img, 13, 24, 6, 1, SIGN);
  return img;
}

/** Nearest-neighbour upscale keeps the pixels crisp at every icon size. */
export function scaleNearest(img: Rgba, factor: number): Rgba {
  const out = blank(img.width * factor, img.height * factor);
  for (let y = 0; y < out.height; y += 1) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < out.width; x += 1) {
      const sx = Math.floor(x / factor);
      const from = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(from, from + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

/** File names Apple's `iconutil` expects inside an `.iconset` folder, with the pixel size of each. */
export const ICONSET_FILES: readonly { name: string; size: number }[] = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];
