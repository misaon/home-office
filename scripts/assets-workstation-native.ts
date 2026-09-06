// Preserve the generated workstation pixels at their source resolution; no prototype downsampling.
import { mkdir } from "node:fs/promises";
import { crop, decodePng, encodePng, type Rgba } from "./lib/png.ts";
import { removeChroma, trimTransparent } from "./lib/sprite-import.ts";
import { writeManifest } from "./lib/manifest.ts";

const source = decodePng(
  new Uint8Array(await Bun.file("assets/reference/workstation-v1/sheet.png").arrayBuffer()),
);
const cell = source.width / 2;
if (source.width !== source.height || !Number.isInteger(cell)) {
  throw new Error("Expected a square sheet of four equal cells");
}
const object = (x: number, y: number): Rgba => {
  const image = crop(source, x * cell, y * cell, cell, cell);
  removeChroma(image);
  return trimTransparent(image);
};
const frames = { desk: object(0, 0), chair: object(1, 0), seated: object(0, 1) };
for (const [name, frame] of Object.entries(frames)) {
  const dir = `assets/src/furniture/sample-${name}-v2`;
  await mkdir(dir, { recursive: true });
  await Bun.write(`${dir}/static_f0.png`, encodePng(frame));
}
const manifest = await writeManifest();
process.stdout.write(`Native workstation sample: ${String(manifest.frames)} manifest frames\n`);
