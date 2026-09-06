/** mulberry32: tiny, seedable, deterministic. The office must replay identically for a given seed. */
export type Rng = {
  next: () => number;
  int: (maxExclusive: number) => number;
  pick: <T>(items: readonly T[]) => T | undefined;
  chance: (p: number) => boolean;
};

export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
};

/** Stable 32-bit hash of a string (FNV-1a) to derive seeds from ids. */
export const hashSeed = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.codePointAt(i) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
