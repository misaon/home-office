import { pino } from "pino";
import type { DaemonConfig } from "./config.ts";

export type Logger = ReturnType<typeof createLogger>;

export const createLogger = (level: DaemonConfig["logLevel"]) =>
  pino({ level, base: { app: "ho" } });
