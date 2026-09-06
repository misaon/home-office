import { resize, removeChroma } from "./lib/sprite-import.ts";
// Reproducible slicing of the generated calibration sheet; source art stays untouched.
import { mkdir } from "node:fs/promises";
import { crop, decodePng, encodePng, type Rgba } from "./lib/png.ts";
import { writeManifest } from "./lib/manifest.ts";

const source = decodePng(
  new Uint8Array(await Bun.file("assets/reference/workstation-v1/sheet.png").arrayBuffer()),
);
const cell = source.width / 2;
if (source.width !== source.height || !Number.isInteger(cell)) {
  throw new Error("Expected a square sheet of four equal cells");
}
const part = (x: number, y: number, size: number): Rgba => {
  const result = resize(crop(source, x * cell, y * cell, cell, cell), size);
  removeChroma(result);
  return result;
};
const frames = {
  desk: part(0, 0, 64),
  chair: crop(part(1, 0, 48), 8, 14, 32, 32),
  seated: crop(part(0, 1, 48), 8, 0, 32, 48),
  carpet: resize(crop(source, cell + 80, cell + 80, 160, 160), 16),
};
for (const [name, frame] of Object.entries(frames)) {
  const dir = `assets/src/furniture/sample-${name}-v1`;
  await mkdir(dir, { recursive: true });
  await Bun.write(`${dir}/static_f0.png`, encodePng(frame));
}
const manifest = await writeManifest();
process.stdout.write(`Workstation sample: ${String(manifest.frames)} manifest frames\n`);
