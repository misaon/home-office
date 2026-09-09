import { rename, stat } from "node:fs/promises";
import { destination, type Logger as PinoLogger, pino } from "pino";
import type { DaemonConfig } from "./config.ts";

export type Logger = PinoLogger;

const MAX_BYTES = 8 * 1024 * 1024;
const CHECK_EVERY_MS = 60_000;

const sizeOf = async (file: string): Promise<number> =>
  (await stat(file).catch(() => null))?.size ?? 0;

/**
 * One previous file is kept, so the desktop app's log costs at most two of these. `reopen()` is what
 * `pino.destination` offers for exactly this: continue writing after the file has been moved away.
 */
const rotatingDestination = (file: string): ReturnType<typeof destination> => {
  const dest = destination({ dest: file, mkdir: true, sync: true });
  const timer = setInterval(() => {
    void (async () => {
      if ((await sizeOf(file)) <= MAX_BYTES) {
        return;
      }
      await rename(file, `${file}.1`).catch(() => undefined);
      dest.reopen();
    })();
  }, CHECK_EVERY_MS);
  timer.unref();
  return dest;
};

/** NDJSON to stdout by default; the desktop app, whose stdout nobody sees, logs to a rotated file. */
export const createLogger = (level: DaemonConfig["logLevel"], file?: string): Logger =>
  file === undefined
    ? pino({ level, base: { app: "ho" } })
    : pino({ level, base: { app: "ho" } }, rotatingDestination(file));
