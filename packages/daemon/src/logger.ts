import { destination, pino } from "pino";
import type { DaemonConfig } from "./config.ts";

export type Logger = ReturnType<typeof createLogger>;

/** NDJSON to stdout by default; the desktop app, whose stdout nobody sees, logs to a file instead. */
export const createLogger = (level: DaemonConfig["logLevel"], file?: string) =>
  file === undefined
    ? pino({ level, base: { app: "ho" } })
    : pino({ level, base: { app: "ho" } }, destination({ dest: file, mkdir: true, sync: true }));
