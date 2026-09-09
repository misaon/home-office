// Where an import lands and how big it must be (from the manifest key and the office plan), plus the sidecar
// every import writes so layers drawn on the same canvas can register on each other (`--like`).
import { CELL_PX, officePlan } from "@ho/sim";
import { z } from "zod";
import type { Rgba } from "./png.ts";
import { type Anchor, place, resample } from "./raster.ts";

const CHARACTER_W = 2;
const CHARACTER_H = 5;

export type Target = {
  category: string;
  sprite: string;
  animation: string;
  /** Canvas width in px; the art is scaled to fill it exactly (furniture) or to fit inside it. */
  width: number;
  /** Canvas height in px, or null when the height follows the art (furniture may overhang upwards). */
  height: number | null;
  /** Furniture sized by `artHeight`: the art is scaled to `height` px and the width follows (`width` is 0). */
  byHeight: boolean;
  /** Footprint height in cells (furniture), to report how far the art rises above it. */
  footprintCells: number;
  anchor: Anchor;
  trim: boolean;
  /** Seamless floor tiles are fully opaque by design; everything else must carry alpha. */
  requireAlpha: boolean;
};

// A function declaration, so TypeScript narrows after a call (a const arrow would not).
export function fail(message: string): never {
  process.stderr.write(`assets:import: ${message}\n`);
  process.exit(1);
}

export function parseCells(value: string | undefined): { w: number; h: number } | null {
  if (value === undefined) {
    return null;
  }
  const match = /^(\d+)x(\d+)$/u.exec(value);
  if (match === null) {
    return fail(`--cells expects WxH in cells, got "${value}"`);
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w < 1 || h < 1 || w * CELL_PX > 4096 || h * CELL_PX > 4096) {
    return fail("--cells must produce dimensions between 1 and 4096 pixels");
  }
  return { w, h };
}

/** Where the art goes and how big it must be, from the manifest key and the office plan. */
export function resolveTarget(key: string, cells: { w: number; h: number } | null): Target {
  const parts = key.split("/");
  const [category, sprite, animation] = parts;
  if (
    parts.length !== 3 ||
    category === undefined ||
    sprite === undefined ||
    animation === undefined
  ) {
    return fail(`expected <category>/<sprite>/<animation>[_<dir>], got "${key}"`);
  }
  if (
    !["tiles", "characters", "bubbles", "furniture"].includes(category) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sprite)
  ) {
    return fail("invalid sprite category or name");
  }
  if (!/^[a-z]+(?:_[nse])?$/u.test(animation)) {
    return fail(
      `animation "${animation}" must be lowercase letters with an optional _n/_s/_e suffix (west is mirrored)`,
    );
  }
  if (category === "tiles") {
    if (cells === null) {
      return fail("tiles need --cells WxH (the size of the repeating tile in cells)");
    }
    return {
      category,
      sprite,
      animation,
      width: cells.w * CELL_PX,
      height: cells.h * CELL_PX,
      byHeight: false,
      footprintCells: cells.h,
      anchor: "bottom-left",
      trim: false,
      requireAlpha: false,
    };
  }
  if (category === "characters") {
    return {
      category,
      sprite,
      animation,
      width: (cells?.w ?? CHARACTER_W) * CELL_PX,
      height: (cells?.h ?? CHARACTER_H) * CELL_PX,
      byHeight: false,
      footprintCells: cells?.h ?? CHARACTER_H,
      anchor: "bottom-centre",
      trim: false,
      requireAlpha: true,
    };
  }
  if (category === "bubbles") {
    return {
      category,
      sprite,
      animation,
      width: (cells?.w ?? 1) * CELL_PX,
      height: (cells?.h ?? 1) * CELL_PX,
      byHeight: false,
      footprintCells: cells?.h ?? 1,
      anchor: "bottom-centre",
      trim: true,
      requireAlpha: true,
    };
  }
  const footprint: { w: number; h: number; artWidth?: number; artHeight?: number } | undefined =
    cells ?? officePlan().objects.find((o) => o.sprite === `${category}/${sprite}`);
  if (footprint === undefined) {
    return fail(
      `"${category}/${sprite}" is not in the office plan; pass --cells WxH for objects outside it`,
    );
  }
  const artWidth = footprint.artWidth ?? footprint.w;
  const byHeight = footprint.artHeight !== undefined;
  return {
    category,
    sprite,
    animation,
    width: byHeight ? 0 : Math.round(artWidth * CELL_PX),
    height: byHeight ? Math.round((footprint.artHeight ?? 0) * CELL_PX) : null,
    byHeight,
    footprintCells: footprint.h,
    anchor: "bottom-left",
    trim: true,
    requireAlpha: true,
  };
}

/**
 * Scales `art` to the target: furniture fills the footprint width (or stands exactly `height` tall when sized by
 * height), everything else fits inside the canvas.
 */
export function fit(art: Rgba, target: Target): { frame: Rgba; scale: number } {
  if (target.byHeight && target.height !== null) {
    const scale = target.height / art.height;
    const scaled = resample(art, Math.max(1, Math.round(art.width * scale)), target.height);
    return { frame: place(scaled, scaled.width, target.height, target.anchor), scale };
  }
  const byWidth = target.width / art.width;
  const scale = target.height === null ? byWidth : Math.min(byWidth, target.height / art.height);
  const scaled = resample(
    art,
    Math.max(1, Math.round(art.width * scale)),
    Math.max(1, Math.round(art.height * scale)),
  );
  const height = target.height ?? scaled.height;
  return { frame: place(scaled, target.width, height, target.anchor), scale };
}

const Size = z.object({ width: z.int().positive(), height: z.int().positive() });
const Sidecar = z.object({
  source: Size,
  crop: z.object({
    x: z.int().nonnegative(),
    y: z.int().nonnegative(),
    w: z.int().positive(),
    h: z.int().positive(),
  }),
  output: Size,
});
export type Sidecar = z.infer<typeof Sidecar>;

export const sidecarOf = (spriteKey: string): string => {
  if (!/^(?:tiles|characters|bubbles|furniture)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(spriteKey)) {
    return fail("invalid sprite key");
  }
  return `assets/src/${spriteKey}/import.json`;
};

export async function readSidecar(spriteKey: string): Promise<Sidecar | null> {
  const raw: unknown = await Bun.file(sidecarOf(spriteKey))
    .json()
    .catch(() => null);
  const parsed = Sidecar.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
