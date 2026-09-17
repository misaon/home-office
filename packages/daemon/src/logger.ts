import { rename, stat } from "node:fs/promises";
import { destination, type Logger as PinoLogger, pino } from "pino";
import type { DaemonConfig } from "./config.ts";
import { VERSION } from "./version.ts";

export type Logger = PinoLogger;

const MAX_BYTES = 32 * 1024 * 1024;
const KEEP = 5;
const CHECK_EVERY_MS = 60_000;
const BASE = { app: "ho", version: VERSION };

const sizeOf = async (file: string): Promise<number> =>
  ((await stat(file).catch(() => null)) ?? { size: 0 }).size;

const rotate = async (file: string): Promise<void> => {
  for (let index = KEEP - 1; index >= 1; index -= 1) {
    await rename(`${file}.${String(index)}`, `${file}.${String(index + 1)}`).catch(() => undefined);
  }
  await rename(file, `${file}.1`).catch(() => undefined);
};

let current: Logger | null = null;

export const daemonLog = (): Logger | null => current;

export const createLogger = (
  level: DaemonConfig["logLevel"],
  file?: string,
): { log: Logger; close: () => void } => {
  if (file === undefined) {
    current = pino({ level, base: BASE });
    return { log: current, close: () => undefined };
  }
  const dest = destination({ dest: file, mkdir: true, sync: true });
  const timer = setInterval(() => {
    void (async () => {
      if ((await sizeOf(file)) <= MAX_BYTES) {
        return;
      }
      await rotate(file);
      dest.reopen();
    })();
  }, CHECK_EVERY_MS);
  timer.unref();
  current = pino({ level, base: BASE }, dest);
  return {
    log: current,
    close: () => {
      clearInterval(timer);
    },
  };
};
