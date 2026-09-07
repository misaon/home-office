// Converts generated art into the sprites the app loads (contract: assets/README.md).
//
//   bun run assets:import <source.png> <category>/<sprite>/<animation>[_<dir>] [--frames N] [--cells WxH]
//                         [--no-key] [--no-align] [--tolerance 40] [--like <category>/<sprite>]
//
// `--like furniture/elevator-cabin` imports a layer drawn on the same source canvas as another sprite: the crop
// and output size recorded for that sprite (assets/src/<category>/<sprite>/import.json) are reused verbatim, so
// door panels land exactly where they sit over the cabin.
//
// `<source.png>` may be a pattern such as "assets/inbox/spa-animate-*.png": the matching files, sorted by the
// number in their name, become frames f0, f1, … of one animation. Furniture frames are each trimmed to their own
// visible pixels and resampled to one common size: generators redraw a static silhouette a few pixels off from
// frame to frame, and equalising the silhouettes is what keeps doors and water from jumping. Characters keep
// their full frame canvas (their silhouette is meant to change).
//
// The source is any PNG a generator produced (typically ~1024 px with a transparent background; a flat
// #FF00FF background is keyed out as a fallback). The converter trims, scales the art to the footprint of the
// plan object (furniture) or to the character/bubble canvas, aligns it the way the renderer expects and writes
// the frame files, then rewrites the manifest and lists what is still a stand-in.
import { CELL_PX } from "@ho/sim";
import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  fail,
  fit,
  parseCells,
  readSidecar,
  resolveTarget,
  type Sidecar,
  sidecarOf,
} from "./lib/import-target.ts";
import { describeManifest, writeManifest } from "./lib/manifest.ts";
import { encodePng, type Rgba } from "./lib/png.ts";
import { decodePng } from "./lib/png-decode.ts";
import {
  ALPHA_MIN,
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

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    frames: { type: "string", default: "1" },
    cells: { type: "string" },
    key: { type: "boolean", default: true },
    align: { type: "boolean", default: true },
    like: { type: "string" },
    tolerance: { type: "string", default: "40" },
  },
});
const [source, key] = positionals;
if (source === undefined || key === undefined) {
  fail(
    "usage: bun run assets:import <source.png> <category>/<sprite>/<animation>[_<dir>] [--frames N] [--cells WxH] [--no-key] [--no-align] [--tolerance 40]",
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
const like: Sidecar | null = values.like === undefined ? null : await readSidecar(values.like);
if (values.like !== undefined && like === null) {
  fail(`--like ${values.like}: no ${sidecarOf(values.like)} — import that sprite first`);
}
if (like !== null && (like.source.width !== first.width || like.source.height !== first.height)) {
  fail(
    `--like ${values.like ?? ""}: that sprite came from a ${String(like.source.width)}×${String(like.source.height)} canvas, this file is ${String(first.width)}×${String(first.height)}`,
  );
}
// One crop for the whole animation: the union of every frame's visible pixels, so frames never jitter.
let bounds: Box | null = like === null ? null : like.crop;
for (const [index, raw] of rawFrames.entries()) {
  const b = opaqueBounds(raw);
  if (b === null) {
    fail(`frame ${String(index)} is fully transparent`);
  }
  if (like !== null) {
    continue;
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
// Size of the union crop after scaling: every furniture frame is resampled to exactly this canvas.
const unionScale = (like?.output.width ?? target.width) / bounds.w;
const unionSize = {
  w: like?.output.width ?? target.width,
  h: like?.output.height ?? Math.max(1, Math.round(bounds.h * unionScale)),
};
for (const [index, raw] of rawFrames.entries()) {
  let art = raw;
  let fitted: { frame: Rgba; scale: number };
  if (like !== null) {
    // A layer over another sprite: identical crop and canvas, whatever this layer's own silhouette is.
    fitted = {
      frame: place(
        resample(crop(raw, bounds), unionSize.w, unionSize.h),
        unionSize.w,
        unionSize.h,
        "bottom-left",
      ),
      scale: unionScale,
    };
  } else if (target.trim && rawFrames.length > 1 && values.align) {
    const own = opaqueBounds(raw);
    art = crop(raw, own ?? bounds);
    fitted = {
      frame: place(
        resample(art, unionSize.w, unionSize.h),
        unionSize.w,
        unionSize.h,
        target.anchor,
      ),
      scale: unionScale,
    };
  } else {
    art = target.trim ? crop(raw, bounds) : raw;
    fitted = fit(art, target);
  }
  const { frame, scale } = fitted;
  const file = `${dir}/${target.animation}_f${String(index)}.png`;
  await Bun.write(file, encodePng(frame));
  if (target.trim && index === 0) {
    report.push(
      like !== null
        ? `  registered on ${values.like ?? ""}: same crop and ${String(unionSize.w)}×${String(unionSize.h)} px canvas`
        : rawFrames.length > 1
          ? `  frames trimmed individually and resampled to the common ${String(unionSize.w)}×${String(unionSize.h)} px (silhouette drift removed)`
          : `  trimmed to the visible object (alpha ≥ ${String(ALPHA_MIN)}): ${String(bounds.w)}×${String(bounds.h)} px at (${String(bounds.x)}, ${String(bounds.y)})`,
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
const sidecar: Sidecar = {
  source: { width: first.width, height: first.height },
  crop: bounds,
  output: { width: unionSize.w, height: like === null && rawFrames.length === 1 ? 0 : unionSize.h },
};
if (sidecar.output.height === 0) {
  // A single frame keeps its own height: read it back from the written file's dimensions.
  const written = decodePng(
    new Uint8Array(await Bun.file(`${dir}/${target.animation}_f0.png`).arrayBuffer()),
  );
  sidecar.output.height = written.height;
}
await Bun.write(
  sidecarOf(`${target.category}/${target.sprite}`),
  `${JSON.stringify(sidecar, null, 2)}\n`,
);
process.stdout.write(`${report.join("\n")}\n`);
process.stdout.write(describeManifest(await writeManifest()));
