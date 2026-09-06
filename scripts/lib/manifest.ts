import { Glob } from "bun";
import { mkdir } from "node:fs/promises";

const SRC = "assets/src";
export const OUT = "assets/dist/manifest.json";
const FRAME = /^(?<animation>[a-z]+(?:_[nsew])?)_f(?<frame>\d+)\.png$/u;

type Manifest = {
  version: 1;
  tileSize: 16;
  sprites: Record<string, Record<string, string[]>>;
};

const frameOf = (path: string): number => Number(/_f(\d+)\.png$/u.exec(path)?.[1] ?? 0);

/** Scans assets/src for `<category>/<sprite>/<animation>[_<dir>]_f<n>.png` and writes the manifest the UI loads. */
export async function writeManifest(): Promise<{
  sprites: number;
  frames: number;
  problems: string[];
}> {
  const manifest: Manifest = { version: 1, tileSize: 16, sprites: {} };
  const problems: string[] = [];
  const files = [...new Glob("**/*.png").scanSync(SRC)].toSorted();
  for (const file of files) {
    const parts = file.split("/");
    const match = FRAME.exec(parts.at(-1) ?? "");
    if (parts.length !== 3 || match?.groups === undefined) {
      problems.push(file);
      continue;
    }
    const spriteKey = `${parts[0]}/${parts[1]}`;
    const animation = match.groups["animation"] ?? "static";
    const frames = (manifest.sprites[spriteKey] ??= {});
    (frames[animation] ??= []).push(`${SRC}/${file}`);
  }
  for (const animations of Object.values(manifest.sprites)) {
    for (const key of Object.keys(animations)) {
      animations[key] = (animations[key] ?? []).toSorted((a, b) => frameOf(a) - frameOf(b));
    }
  }
  await mkdir("assets/dist", { recursive: true });
  await Bun.write(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  return { sprites: Object.keys(manifest.sprites).length, frames: files.length, problems };
}
