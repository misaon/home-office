// Generates a complete placeholder sprite set at native resolution so the office renders before real art
// arrives. Real sprites imported later overwrite these files one by one (same names, same manifest keys).
import { mkdir } from "node:fs/promises";
import { writeManifest } from "./lib/manifest.ts";
import { encodePng } from "./lib/png.ts";
import { entries as bubbles } from "./lib/placeholders/bubbles.ts";
import { entries as characters } from "./lib/placeholders/characters.ts";
import { entries as furniture } from "./lib/placeholders/furniture.ts";
import { entries as tiles } from "./lib/placeholders/tiles.ts";

const SRC = "assets/src";
let written = 0;
for (const { key, animation, frames } of [...characters, ...tiles, ...furniture, ...bubbles]) {
  await mkdir(`${SRC}/${key}`, { recursive: true });
  for (const [i, frame] of frames.entries()) {
    await Bun.write(`${SRC}/${key}/${animation}_f${String(i)}.png`, encodePng(frame));
    written += 1;
  }
}

const manifest = await writeManifest();
process.stdout.write(
  `placeholders: ${String(written)} frames; manifest: ${String(manifest.sprites)} sprites, ${String(manifest.frames)} frames\n`,
);
