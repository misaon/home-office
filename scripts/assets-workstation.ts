// Reproducible slicing of the generated calibration sheet; source art stays untouched.
import { mkdir } from "node:fs/promises";
import { crop, decodePng, encodePng, keyOut, blank, setPixel, type Rgba } from "./lib/png.ts";
import { writeManifest } from "./lib/manifest.ts";

const source = decodePng(
  new Uint8Array(await Bun.file("assets/reference/workstation-v1/sheet.png").arrayBuffer()),
);
const cell = source.width / 2;
if (source.width !== source.height || !Number.isInteger(cell)) {
  throw new Error("Expected a square sheet of four equal cells");
}
const resize = (image: Rgba, size: number): Rgba => {
  const result = blank(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor(((x + 0.5) * image.width) / size);
      const sy = Math.floor(((y + 0.5) * image.height) / size);
      const i = (sy * image.width + sx) * 4;
      setPixel(result, x, y, [
        image.data[i] ?? 0,
        image.data[i + 1] ?? 0,
        image.data[i + 2] ?? 0,
        image.data[i + 3] ?? 0,
      ]);
    }
  }
  return result;
};
const part = (x: number, y: number, size: number): Rgba => {
  const result = resize(crop(source, x * cell, y * cell, cell, cell), size);
  keyOut(result);
  // The generator leaves dark chroma fringes; remove only magenta-dominant pixels.
  for (let i = 0; i < result.data.length; i += 4) {
    const r = result.data[i] ?? 0;
    const g = result.data[i + 1] ?? 0;
    const b = result.data[i + 2] ?? 0;
    if (r > 60 && b > 60 && r > b * 0.7 && b > r * 0.7 && g < Math.min(r, b) * 0.65) {
      result.data[i + 3] = 0;
    }
  }
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
