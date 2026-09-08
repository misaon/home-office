// Raster helpers for the asset converter: chroma key, trimming, area-averaging resample and placement.
import { blank, type Rgba } from "./png.ts";

const px = (img: Rgba, x: number, y: number): number => (y * img.width + x) * 4;

/** Magenta (#FF00FF) within `tolerance` per channel: the fallback key colour when a generator cannot export alpha. */
const isKey = (r: number, g: number, b: number, tolerance: number): boolean =>
  r >= 255 - tolerance && g <= tolerance && b >= 255 - tolerance;

/** True when the image was delivered on a flat magenta background (all four corners carry the key colour). */
export function hasKeyBackground(img: Rgba, tolerance = 40): boolean {
  const corners = [
    px(img, 0, 0),
    px(img, img.width - 1, 0),
    px(img, 0, img.height - 1),
    px(img, img.width - 1, img.height - 1),
  ];
  return corners.every((i) =>
    isKey(img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0, tolerance),
  );
}

/** Makes every key-coloured pixel transparent; `tolerance` absorbs JPEG-like noise from the generator. */
export function keyOut(img: Rgba, tolerance = 40): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (isKey(out.data[i] ?? 0, out.data[i + 1] ?? 0, out.data[i + 2] ?? 0, tolerance)) {
      out.data[i + 3] = 0;
    }
  }
  return out;
}

/** False when nothing in the image is transparent — the background was baked in (a painted checkerboard). */
export function hasTransparency(img: Rgba): boolean {
  for (let i = 3; i < img.data.length; i += 4) {
    if ((img.data[i] ?? 255) < 255) {
      return true;
    }
  }
  return false;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Generators leave an invisible halo (alpha 1–15) far outside the object; below this alpha a pixel counts as
 * empty for trimming and is cleared so it cannot tint edges when resampling.
 */
export const ALPHA_MIN = 16;

/** Clears the faint halo (alpha below `ALPHA_MIN`) so bounds and resampling see only the visible object. */
export function clearFaint(img: Rgba): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 3; i < out.data.length; i += 4) {
    if ((out.data[i] ?? 0) < ALPHA_MIN) {
      out.data[i] = 0;
    }
  }
  return out;
}

/** Bounding box of the visible pixels (alpha ≥ `ALPHA_MIN`), or null for an empty image. */
export function opaqueBounds(img: Rgba): Box | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((img.data[px(img, x, y) + 3] ?? 0) >= ALPHA_MIN) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(img: Rgba, box: Box): Rgba {
  const out = blank(box.w, box.h);
  for (let y = 0; y < box.h; y += 1) {
    const from = px(img, box.x, box.y + y);
    out.data.set(img.data.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return out;
}

/**
 * Area-averaging resample (box filter with fractional coverage) in premultiplied alpha, so transparent
 * neighbours never bleed dark fringes into edges. Works for any ratio; downscaling is where it matters.
 */
export function resample(img: Rgba, width: number, height: number): Rgba {
  const out = blank(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let oy = 0; oy < height; oy += 1) {
    const top = oy * sy;
    const bottom = (oy + 1) * sy;
    for (let ox = 0; ox < width; ox += 1) {
      const left = ox * sx;
      const right = (ox + 1) * sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let alphaSum = 0;
      let weightSum = 0;
      for (let y = Math.floor(top); y < Math.min(Math.ceil(bottom), img.height); y += 1) {
        const wy = Math.min(bottom, y + 1) - Math.max(top, y);
        for (let x = Math.floor(left); x < Math.min(Math.ceil(right), img.width); x += 1) {
          const w = wy * (Math.min(right, x + 1) - Math.max(left, x));
          const i = px(img, x, y);
          const a = (img.data[i + 3] ?? 0) / 255;
          r += (img.data[i] ?? 0) * a * w;
          g += (img.data[i + 1] ?? 0) * a * w;
          b += (img.data[i + 2] ?? 0) * a * w;
          alphaSum += a * w;
          weightSum += w;
        }
      }
      const o = px(out, ox, oy);
      if (alphaSum > 0) {
        out.data[o] = Math.round(r / alphaSum);
        out.data[o + 1] = Math.round(g / alphaSum);
        out.data[o + 2] = Math.round(b / alphaSum);
        out.data[o + 3] = Math.round((alphaSum / weightSum) * 255);
      }
    }
  }
  return out;
}

export type Anchor = "bottom-left" | "bottom-centre";

/** Places `img` on a transparent canvas of the given size with its bottom edge on the canvas's bottom row. */
export function place(img: Rgba, width: number, height: number, anchor: Anchor): Rgba {
  const out = blank(width, height);
  const dx = anchor === "bottom-left" ? 0 : Math.floor((width - img.width) / 2);
  const dy = height - img.height;
  for (let y = 0; y < img.height; y += 1) {
    const ty = y + dy;
    if (ty < 0 || ty >= height) {
      continue;
    }
    for (let x = 0; x < img.width; x += 1) {
      const tx = x + dx;
      if (tx >= 0 && tx < width) {
        out.data.set(img.data.subarray(px(img, x, y), px(img, x, y) + 4), px(out, tx, ty));
      }
    }
  }
  return out;
}

/** Splits a horizontal strip into `count` equal frames (the way generators deliver walk cycles). */
export function splitStrip(img: Rgba, count: number): Rgba[] {
  if (count > img.width || img.width % count !== 0) {
    throw new Error("sprite strip width must be divisible by the frame count");
  }
  const w = img.width / count;
  return Array.from({ length: count }, (_, i) => crop(img, { x: i * w, y: 0, w, h: img.height }));
}
