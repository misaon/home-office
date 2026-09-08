import { CELL_PX, officePlan } from "@ho/sim";
import { CryptoHasher, Glob } from "bun";
import { mkdir } from "node:fs/promises";

const SRC = "assets/src";
const OUT = "assets/dist/manifest.json";
const FRAME = /^(?<animation>[a-z]+(?:_[nsew])?)_f(?<frame>\d+)\.png$/u;

type Manifest = {
  version: 1;
  tileSize: number;
  revision: number;
  sprites: Record<string, Record<string, string[]>>;
};

/** A plan object whose sprite key has no delivered art yet, with the size the art must have. */
type Missing = { key: string; count: number; cells: string; pixels: string };

const frameOf = (path: string): number => Number(/_f(\d+)\.png$/u.exec(path)?.[1] ?? 0);

/** Objects of the office plan without a `furniture/<key>` sprite, grouped by key (docs/OFFICE-ART.md table). */
function missingFurniture(sprites: Manifest["sprites"]): Missing[] {
  const byKey = new Map<string, Missing>();
  for (const item of officePlan().objects) {
    if (item.sprite in sprites) {
      continue;
    }
    const entry = byKey.get(item.sprite);
    if (entry !== undefined) {
      entry.count += 1;
      continue;
    }
    byKey.set(item.sprite, {
      key: item.sprite,
      count: 1,
      cells: `${String(item.w)} × ${String(item.h)}${item.artWidth === undefined ? "" : ` (art ${String(item.artWidth)} wide)`}`,
      pixels: `${String(Math.round((item.artWidth ?? item.w) * CELL_PX))} × ${String(item.h * CELL_PX)}`,
    });
  }
  return [...byKey.values()];
}

/** Scans assets/src for `<category>/<sprite>/<animation>[_<dir>]_f<n>.png` and writes the manifest the UI loads. */
export async function writeManifest(): Promise<{
  sprites: number;
  frames: number;
  problems: string[];
  missing: Missing[];
}> {
  const manifest: Manifest = { version: 1, tileSize: CELL_PX, revision: 0, sprites: {} };
  const problems: string[] = [];
  const hash = new CryptoHasher("sha256");
  hash.update(String(CELL_PX));
  const files = [...new Glob("**/*.png").scanSync(SRC)].toSorted();
  for (const file of files) {
    hash.update(file);
    hash.update(new Uint8Array(await Bun.file(`${SRC}/${file}`).arrayBuffer()));
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
  manifest.revision = Number.parseInt(hash.digest("hex").slice(0, 12), 16);
  await mkdir("assets/dist", { recursive: true });
  await Bun.write(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    sprites: Object.keys(manifest.sprites).length,
    frames: files.length,
    problems,
    missing: missingFurniture(manifest.sprites),
  };
}

/** Human-readable summary shared by `assets:manifest` and `assets:import`. */
export function describeManifest(result: Awaited<ReturnType<typeof writeManifest>>): string {
  const lines = [`${OUT}: ${String(result.sprites)} sprites, ${String(result.frames)} frames`];
  if (result.problems.length > 0) {
    lines.push(`ignored (bad name):`, ...result.problems.map((p) => `  ${p}`));
  }
  if (result.missing.length > 0) {
    lines.push(`still stand-ins (${String(result.missing.length)} keys):`);
    for (const m of result.missing) {
      lines.push(
        `  ${m.key.padEnd(26)} ${m.cells.padEnd(8)} cells = ${m.pixels.padEnd(10)} px  ×${String(m.count)}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
