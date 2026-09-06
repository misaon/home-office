// Converts generator output from assets/inbox (8x-scaled PNGs, horizontal strips, autotile sheets) into native
// per-frame PNGs under assets/src, then refreshes the manifest. See assets/README.md for the naming contract.
import { Glob } from "bun";
import { mkdir } from "node:fs/promises";
import { writeManifest } from "./lib/manifest.ts";
import { crop, decodePng, encodePng, keyOut, type Rgba, sampleBlocks } from "./lib/png.ts";

const INBOX = "assets/inbox";
const SRC = "assets/src";
const NAME =
  /^(?<animation>[a-z]+(?:_[nse])?)_(?:f(?<frame>\d+)|strip(?<strip>\d+))(?<scale>@8x)?\.png$/u;
const AUTOTILE = /^autotile3x3(?<scale>@8x)?\.png$/u;
const TILE = 16;

const expectedFrame = (category: string, w: number, h: number): string | null => {
  switch (category) {
    case "characters": {
      return w === 32 && h === 32
        ? null
        : `character frames must be 32×32, got ${String(w)}×${String(h)}`;
    }
    case "bubbles":
    case "props":
    case "tiles": {
      return w === TILE && h === TILE
        ? null
        : `${category} must be 16×16, got ${String(w)}×${String(h)}`;
    }
    case "furniture": {
      return w % TILE === 0 && h % TILE === 0 && w <= 64 && h <= 64
        ? null
        : `furniture must be multiples of 16 up to 64, got ${String(w)}×${String(h)}`;
    }
    default: {
      return `unknown category "${category}"`;
    }
  }
};

const hasAlpha = (img: Rgba): boolean => {
  for (let i = 3; i < img.data.length; i += 4) {
    if ((img.data[i] ?? 255) < 255) {
      return true;
    }
  }
  return false;
};

const normalise = (img: Rgba, scaled: boolean, file: string): Rgba => {
  let out = img;
  if (scaled) {
    if (img.width % 8 !== 0 || img.height % 8 !== 0) {
      throw new Error(
        `${file}: @8x image dimensions must be multiples of 8 (got ${String(img.width)}×${String(img.height)})`,
      );
    }
    out = sampleBlocks(img, 8);
  }
  if (!hasAlpha(out)) {
    keyOut(out);
  }
  return out;
};

const files = [...new Glob("**/*.png").scanSync(INBOX)].toSorted();
let written = 0;
const problems: string[] = [];
for (const file of files) {
  const parts = file.split("/");
  const [category, sprite, name] = parts;
  if (parts.length !== 3 || category === undefined || sprite === undefined || name === undefined) {
    problems.push(`${file}: expected <category>/<sprite>/<file>.png`);
    continue;
  }
  const outDir = `${SRC}/${category}/${sprite}`;
  try {
    const img = decodePng(new Uint8Array(await Bun.file(`${INBOX}/${file}`).arrayBuffer()));
    const auto = AUTOTILE.exec(name);
    const frames: { name: string; image: Rgba }[] = [];
    if (auto === null) {
      const match = NAME.exec(name);
      if (match?.groups === undefined) {
        throw new Error(`${file}: name does not match <animation>[_dir]_(f<n>|strip<N>)[@8x].png`);
      }
      const animation = match.groups["animation"] ?? "static";
      const whole = normalise(img, match.groups["scale"] !== undefined, file);
      const stripCount = match.groups["strip"] === undefined ? 1 : Number(match.groups["strip"]);
      if (whole.width % stripCount !== 0) {
        throw new Error(
          `${file}: strip width ${String(whole.width)} is not divisible by ${String(stripCount)} frames`,
        );
      }
      const frameWidth = whole.width / stripCount;
      const problem = expectedFrame(category, frameWidth, whole.height);
      if (problem !== null) {
        throw new Error(`${file}: ${problem}`);
      }
      const first = match.groups["frame"] === undefined ? 0 : Number(match.groups["frame"]);
      for (let i = 0; i < stripCount; i += 1) {
        frames.push({
          name: `${animation}_f${String(first + i)}.png`,
          image: crop(whole, i * frameWidth, 0, frameWidth, whole.height),
        });
      }
    } else {
      const sheet = normalise(img, typeof auto.groups?.["scale"] === "string", file);
      if (sheet.width !== 3 * TILE || sheet.height !== 3 * TILE) {
        throw new Error(`${file}: autotile sheet must be 48×48 logical pixels`);
      }
      for (let i = 0; i < 9; i += 1) {
        frames.push({
          name: `autotile_f${String(i)}.png`,
          image: crop(sheet, (i % 3) * TILE, Math.floor(i / 3) * TILE, TILE, TILE),
        });
      }
    }
    await mkdir(outDir, { recursive: true });
    for (const frame of frames) {
      await Bun.write(`${outDir}/${frame.name}`, encodePng(frame.image));
      written += 1;
    }
    process.stdout.write(`✔ ${file} → ${String(frames.length)} frame(s)\n`);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}
const manifest = await writeManifest();
process.stdout.write(
  `imported ${String(written)} frames from ${String(files.length)} files; manifest: ${String(manifest.sprites)} sprites, ${String(manifest.frames)} frames\n`,
);
if (problems.length > 0) {
  process.stdout.write(`problems:\n  ${problems.join("\n  ")}\n`);
  process.exitCode = 1;
}
