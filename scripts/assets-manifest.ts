// Scans assets/src for PNG frames named <category>/<sprite>/<animation>[_<dir>]_f<n>.png
// and writes assets/dist/manifest.json for the UI's texture loader.
import { Glob } from "bun";
import { mkdir } from "node:fs/promises";

const SRC = "assets/src";
const OUT = "assets/dist/manifest.json";
const FRAME = /^(?<animation>[a-z]+(?:_[nsew])?)_f(?<frame>\d+)\.png$/u;

type Manifest = { version: 1; tileSize: 16; sprites: Record<string, Record<string, string[]>> };

const manifest: Manifest = { version: 1, tileSize: 16, sprites: {} };
const problems: string[] = [];
const files = [...new Glob("**/*.png").scanSync(SRC)].toSorted();

for (const file of files) {
  const parts = file.split("/");
  const fileName = parts.at(-1) ?? "";
  const match = FRAME.exec(fileName);
  if (parts.length !== 3 || match?.groups === undefined) {
    problems.push(file);
    continue;
  }
  const spriteKey = `${parts[0]}/${parts[1]}`;
  const animation = match.groups["animation"] ?? "static";
  const frames = (manifest.sprites[spriteKey] ??= {});
  (frames[animation] ??= []).push(`${SRC}/${file}`);
}

const frameOf = (path: string): number => Number(/_f(\d+)\.png$/u.exec(path)?.[1] ?? 0);
for (const animations of Object.values(manifest.sprites)) {
  for (const key of Object.keys(animations)) {
    animations[key] = (animations[key] ?? []).toSorted((a, b) => frameOf(a) - frameOf(b));
  }
}

await mkdir("assets/dist", { recursive: true });
await Bun.write(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `${OUT}: ${String(Object.keys(manifest.sprites).length)} sprites, ${String(files.length)} frames\n`,
);
if (problems.length > 0) {
  process.stdout.write(`ignored (bad name):\n  ${problems.join("\n  ")}\n`);
  process.exitCode = 1;
}
