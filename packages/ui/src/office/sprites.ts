import type { Activity } from "@ho/sim";
import { Assets, type Texture, TextureSource } from "pixi.js";
import { z } from "zod";

const Manifest = z.object({
  tileSize: z.int().positive(),
  sprites: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
});

export type Clip = { textures: Texture[]; flip: boolean; frameMs: number };

/** 1 for art delivered at the contract size; otherwise the uniform factor that brings it to `target` pixels. */
export const fitScale = (actual: number, target: number): number =>
  actual > 0 && actual !== target ? target / actual : 1;

const FRAME_MS: Partial<Record<Activity, number>> = {
  walk: 140,
  type: 180,
  idle: 600,
  sleep: 900,
  celebrate: 250,
};

/** Textures for every sprite in the manifest, addressed as `<category>/<sprite>` + animation. */
export class SpriteLibrary {
  readonly #clips = new Map<string, Texture[]>();
  readonly #animations = new Map<string, string[]>();

  async load(): Promise<void> {
    TextureSource.defaultOptions.scaleMode = "nearest";
    const response = await fetch("/assets/dist/manifest.json");
    if (!response.ok) {
      throw new Error(`manifest: HTTP ${String(response.status)}`);
    }
    const manifest = Manifest.parse(await response.json());
    const jobs: Promise<void>[] = [];
    for (const [key, animations] of Object.entries(manifest.sprites)) {
      this.#animations.set(key, Object.keys(animations));
      for (const [animation, frames] of Object.entries(animations)) {
        jobs.push(
          Promise.all(frames.map((path) => Assets.load<Texture>(`/${path}`))).then((textures) => {
            this.#clips.set(`${key}/${animation}`, textures);
          }),
        );
      }
    }
    await Promise.all(jobs);
  }

  /** Sprite sets available for agents (`characters/<set>` → `<set>`). */
  characterSets(): string[] {
    return [...this.#animations.keys()]
      .filter((k) => k.startsWith("characters/"))
      .map((k) => k.slice("characters/".length))
      .toSorted();
  }

  has(key: string): boolean {
    return this.#animations.has(key);
  }

  frames(key: string, animation: string): Texture[] | undefined {
    return this.#clips.get(`${key}/${animation}`);
  }

  /** Best available animation for a character: exact direction, then south, then idle; west flips east. */
  clip(key: string, activity: Activity, facing: "n" | "e" | "s" | "w"): Clip | null {
    const dir = facing === "w" ? "e" : facing;
    const candidates = [
      `${activity}_${dir}`,
      `${activity}_s`,
      activity,
      `idle_${dir}`,
      "idle_s",
      "static",
    ];
    for (const name of candidates) {
      const textures = this.frames(key, name);
      if (textures !== undefined && textures.length > 0) {
        return {
          textures,
          flip: facing === "w" && name.endsWith("_e"),
          frameMs: FRAME_MS[activity] ?? 320,
        };
      }
    }
    return null;
  }
}
