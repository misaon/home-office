// Import the reviewed 4×4 Alex sheet with stable feet alignment and a shared scale per row.
import { mkdir } from "node:fs/promises";
import { blank, crop, decodePng, encodePng, type Rgba } from "./lib/png.ts";
import { removeChroma } from "./lib/sprite-import.ts";
import { writeManifest } from "./lib/manifest.ts";

const typingSource = decodePng(
  new Uint8Array(await Bun.file("assets/reference/alex-v1/sheet.png").arrayBuffer()),
);
removeChroma(typingSource);
const walkSource = decodePng(
  new Uint8Array(await Bun.file("assets/reference/alex-v1/walk-sheet.png").arrayBuffer()),
);
removeChroma(walkSource);
const bounds = (img: Rgba): { x: number; y: number; w: number; h: number } => {
  let left = img.width;
  let right = -1;
  let top = img.height;
  let bottom = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) {
    throw new Error("Empty animation cell");
  }
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
};
const register = (
  frame: Rgba,
  box: ReturnType<typeof bounds>,
  scale: number,
  seated: boolean,
): Rgba => {
  const out = blank(32, seated ? 48 : 32);
  const baseline = seated ? 44 : 31;
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const sx = Math.floor(box.x + box.w / 2 + (x + 0.5 - 16) / scale);
      const sy = Math.floor(box.y + box.h + (y + 0.5 - baseline) / scale);
      if (sx < 0 || sy < 0 || sx >= frame.width || sy >= frame.height) {
        continue;
      }
      const i = (sy * frame.width + sx) * 4;
      out.data.set(frame.data.subarray(i, i + 4), (y * out.width + x) * 4);
    }
  }
  return out;
};
for (const [row, direction] of ["s", "n", "e", "n"].entries()) {
  const source = row === 3 ? typingSource : walkSource;
  const frames = Array.from({ length: 4 }, (_, col) => {
    const x = Math.floor((col * source.width) / 4),
      y = Math.floor((row * source.height) / 4);
    return crop(
      source,
      x,
      y,
      Math.floor(((col + 1) * source.width) / 4) - x,
      Math.floor(((row + 1) * source.height) / 4) - y,
    );
  });
  const boxes = frames.map((frame) => bounds(frame));
  const seated = row === 3;
  const scale = Math.min(
    (seated ? 38 : 29) / Math.max(...boxes.map((b) => b.h)),
    28 / Math.max(...boxes.map((b) => b.w)),
  );
  const dir = seated
    ? "assets/src/furniture/sample-alex-typing-v1"
    : "assets/src/characters/alex-v1";
  await mkdir(dir, { recursive: true });
  for (const [index, frame] of frames.entries()) {
    const box = boxes[index];
    if (box === undefined) {
      throw new Error("Missing frame bounds");
    }
    const out = register(frame, box, scale, seated);
    const animation = seated ? "type_n" : `walk_${direction}`;
    await Bun.write(`${dir}/${animation}_f${String(index)}.png`, encodePng(out));
    if (!seated && index === 0) {
      await Bun.write(`${dir}/idle_${direction}_f0.png`, encodePng(out));
    }
  }
}
const manifest = await writeManifest();
process.stdout.write(`Alex animation: ${String(manifest.frames)} manifest frames\n`);
