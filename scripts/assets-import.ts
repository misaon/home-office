// Converts generated art into the sprites the app loads (contract: assets/README.md).
//
//   bun run assets:import <source.png> <category>/<sprite>/<animation>[_<dir>] [--frames N] [--cells WxH]
//                         [--no-key] [--tolerance 40]
//
// `<source.png>` may be a pattern such as "assets/inbox/spa-animate-*.png": the matching files, sorted by the
// number in their name, become frames f0, f1, … of one animation. Frames of one animation are trimmed to their
// common bounding box and scaled by one factor, so nothing jitters between frames.
//
// The source is any PNG a generator produced (typically ~1024 px with a transparent background; a flat
// #FF00FF background is keyed out as a fallback). The converter trims, scales the art to the footprint of the
// plan object (furniture) or to the character/bubble canvas, aligns it the way the renderer expects and writes
// the frame files, then rewrites the manifest and lists what is still a stand-in.
import { CELL_PX, officePlan } from "@ho/sim";
import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { describeManifest, writeManifest } from "./lib/manifest.ts";
import { encodePng, type Rgba } from "./lib/png.ts";
import { decodePng } from "./lib/png-decode.ts";
import {
  ALPHA_MIN,
  type Anchor,
  type Box,
  clearFaint,
  crop,
  hasKeyBackground,
  hasTransparency,
  keyOut,
  opaqueBounds,
  place,
  resample,
  splitStrip,
} from "./lib/raster.ts";

const CHARACTER_W = 2;
const CHARACTER_H = 5;

type Target = {
  category: string;
  sprite: string;
  animation: string;
  /** Canvas width in px; the art is scaled to fill it exactly (furniture) or to fit inside it. */
  width: number;
  /** Canvas height in px, or null when the height follows the art (furniture may overhang upwards). */
  height: number | null;
  /** Footprint height in cells (furniture), to report how far the art rises above it. */
  footprintCells: number;
  anchor: Anchor;
  trim: boolean;
};

// A function declaration, so TypeScript narrows after a call (a const arrow would not).
function fail(message: string): never {
  process.stderr.write(`assets:import: ${message}\n`);
  process.exit(1);
}

function parseCells(value: string | undefined): { w: number; h: number } | null {
  if (value === undefined) {
    return null;
  }
  const match = /^(\d+)x(\d+)$/u.exec(value);
  if (match === null) {
    return fail(`--cells expects WxH in cells, got "${value}"`);
  }
  return { w: Number(match[1]), h: Number(match[2]) };
}

/** Where the art goes and how big it must be, from the manifest key and the office plan. */
function resolveTarget(key: string, cells: { w: number; h: number } | null): Target {
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
  if (!/^[a-z]+(?:_[nse])?$/u.test(animation)) {
    return fail(
      `animation "${animation}" must be lowercase letters with an optional _n/_s/_e suffix (west is mirrored)`,
    );
  }
  if (category === "characters") {
    return {
      category,
      sprite,
      animation,
      width: (cells?.w ?? CHARACTER_W) * CELL_PX,
      height: (cells?.h ?? CHARACTER_H) * CELL_PX,
      footprintCells: cells?.h ?? CHARACTER_H,
      anchor: "bottom-centre",
      trim: false,
    };
  }
  if (category === "bubbles") {
    return {
      category,
      sprite,
      animation,
      width: (cells?.w ?? 1) * CELL_PX,
      height: (cells?.h ?? 1) * CELL_PX,
      footprintCells: cells?.h ?? 1,
      anchor: "bottom-centre",
      trim: true,
    };
  }
  const footprint: { w: number; h: number; artWidth?: number } | undefined =
    cells ?? officePlan().objects.find((o) => o.sprite === `${category}/${sprite}`);
  if (footprint === undefined) {
    return fail(
      `"${category}/${sprite}" is not in the office plan; pass --cells WxH for objects outside it`,
    );
  }
  const artWidth = footprint.artWidth ?? footprint.w;
  return {
    category,
    sprite,
    animation,
    width: Math.round(artWidth * CELL_PX),
    height: null,
    footprintCells: footprint.h,
    anchor: "bottom-left",
    trim: true,
  };
}

/** Scales `art` to the target: furniture fills the footprint width, everything else fits inside the canvas. */
function fit(art: Rgba, target: Target): { frame: Rgba; scale: number } {
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

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    frames: { type: "string", default: "1" },
    cells: { type: "string" },
    key: { type: "boolean", default: true },
    tolerance: { type: "string", default: "40" },
  },
});
const [source, key] = positionals;
if (source === undefined || key === undefined) {
  fail(
    "usage: bun run assets:import <source.png> <category>/<sprite>/<animation>[_<dir>] [--frames N] [--cells WxH] [--no-key] [--tolerance 40]",
  );
}
const frameCount = Number(values.frames);
if (!Number.isInteger(frameCount) || frameCount < 1) {
  fail(`--frames expects a positive integer, got "${values.frames}"`);
}
const tolerance = Number(values.tolerance);
const target = resolveTarget(key, parseCells(values.cells));

const numberOf = (path: string): number => Number(/(\d+)\.png$/u.exec(path)?.[1] ?? 0);

/** The files behind `source`: one path, or a `*` pattern expanded and sorted by the number in each file name. */
function sourceFiles(pattern: string): string[] {
  if (!pattern.includes("*")) {
    return [pattern];
  }
  const files = [...new Glob(pattern).scanSync(".")].toSorted((a, b) => numberOf(a) - numberOf(b));
  if (files.length === 0) {
    fail(`no file matches ${pattern}`);
  }
  return files;
}

const files = sourceFiles(source);
if (files.length > 1 && frameCount > 1) {
  fail("--frames splits one strip; a file sequence already provides the frames");
}
const rawFrames: Rgba[] = [];
let keyed = false;
for (const file of files) {
  let image = decodePng(new Uint8Array(await Bun.file(file).arrayBuffer()));
  keyed = values.key && hasKeyBackground(image, tolerance);
  if (keyed) {
    image = keyOut(image, tolerance);
  }
  if (!hasTransparency(image)) {
    fail(
      `${file} has no transparent pixel: the background is baked in (a painted checkerboard?). Re-export with a real alpha channel, or on a flat #FF00FF background.`,
    );
  }
  rawFrames.push(
    ...(files.length > 1 ? [clearFaint(image)] : splitStrip(clearFaint(image), frameCount)),
  );
}
const first = rawFrames[0];
if (first === undefined) {
  fail("nothing to import");
}
// One crop for the whole animation: the union of every frame's visible pixels, so frames never jitter.
let bounds: Box | null = null;
for (const [index, raw] of rawFrames.entries()) {
  const b = opaqueBounds(raw);
  if (b === null) {
    fail(`frame ${String(index)} is fully transparent`);
  }
  bounds =
    bounds === null
      ? b
      : {
          x: Math.min(bounds.x, b.x),
          y: Math.min(bounds.y, b.y),
          w: Math.max(bounds.x + bounds.w, b.x + b.w) - Math.min(bounds.x, b.x),
          h: Math.max(bounds.y + bounds.h, b.y + b.h) - Math.min(bounds.y, b.y),
        };
}
if (bounds === null) {
  fail("nothing visible to import");
}
const dir = `assets/src/${target.category}/${target.sprite}`;
await mkdir(dir, { recursive: true });
const report: string[] = [
  `${files.length > 1 ? `${String(files.length)} files (${files[0] ?? ""} …)` : source}: ${String(first.width)}×${String(first.height)}, ${keyed ? "flat #FF00FF background keyed out" : "transparent as delivered"}, ${String(rawFrames.length)} frame(s)`,
];
for (const [index, raw] of rawFrames.entries()) {
  const art = target.trim ? crop(raw, bounds) : raw;
  const { frame, scale } = fit(art, target);
  const file = `${dir}/${target.animation}_f${String(index)}.png`;
  await Bun.write(file, encodePng(frame));
  if (target.trim) {
    report.push(
      `  trimmed to the visible object (alpha ≥ ${String(ALPHA_MIN)}): ${String(bounds.w)}×${String(bounds.h)} px at (${String(bounds.x)}, ${String(bounds.y)})`,
    );
  }
  const overhang =
    target.height === null
      ? ` (${(frame.height / CELL_PX - target.footprintCells).toFixed(1)} cells above the footprint)`
      : "";
  report.push(
    `  ${file}: ${String(frame.width)}×${String(frame.height)} px, scale ${scale.toFixed(3)}${overhang}`,
  );
}
process.stdout.write(`${report.join("\n")}\n`);
process.stdout.write(describeManifest(await writeManifest()));
