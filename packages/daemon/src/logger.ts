import { rename, stat } from "node:fs/promises";
import { destination, type Logger as PinoLogger, pino } from "pino";
import type { DaemonConfig } from "./config.ts";

export type Logger = PinoLogger;

const MAX_BYTES = 8 * 1024 * 1024;
const CHECK_EVERY_MS = 60_000;

const sizeOf = async (file: string): Promise<number> =>
  ((await stat(file).catch(() => null)) ?? { size: 0 }).size;

export const createLogger = (
  level: DaemonConfig["logLevel"],
  file?: string,
): { log: Logger; close: () => void } => {
  if (file === undefined) {
    return { log: pino({ level, base: { app: "ho" } }), close: () => undefined };
  }
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
  return {
    log: pino({ level, base: { app: "ho" } }, dest),
    close: () => {
      clearInterval(timer);
    },
  };
};
