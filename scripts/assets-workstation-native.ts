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
  // The chair cell in the generated reference sheet touches the teal carpet
  // from the neighboring panel. It is a full-width opaque band, so chroma
  // removal cannot distinguish it from the chair itself.
  if (x === 1 && y === 0) {
    for (let row = image.height - 1; row >= 0; row -= 1) {
      let opaque = 0;
      let teal = 0;
      for (let column = 0; column < image.width; column += 1) {
        const offset = (row * image.width + column) * 4;
        const alpha = image.data[offset + 3] ?? 0;
        if (alpha === 0) {
          continue;
        }
        opaque += 1;
        const red = image.data[offset] ?? 0;
        const green = image.data[offset + 1] ?? 0;
        const blue = image.data[offset + 2] ?? 0;
        if (green > red * 1.1 && blue > red * 1.1 && green > 50) {
          teal += 1;
        }
      }
      if (opaque === 0 || teal / opaque < 0.8) {
        break;
      }
      for (let column = 0; column < image.width; column += 1) {
        image.data[(row * image.width + column) * 4 + 3] = 0;
      }
    }
  }
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
