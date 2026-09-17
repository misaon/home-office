type Stopwatch = {
  lap: (name: string) => number;
  laps: () => Readonly<Record<string, number>>;
  total: () => number;
};

export const elapsedMs = (sinceNanos: number): number =>
  Math.round((Bun.nanoseconds() - sinceNanos) / 1e6);

export const stopwatch = (): Stopwatch => {
  const started = Bun.nanoseconds();
  let last = started;
  const laps: Record<string, number> = {};
  return {
    lap: (name) => {
      const now = Bun.nanoseconds();
      const ms = Math.round((now - last) / 1e6);
      laps[name] = ms;
      last = now;
      return ms;
    },
    laps: () => ({ ...laps }),
    total: () => elapsedMs(started),
  };
};
