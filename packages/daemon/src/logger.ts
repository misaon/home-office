import { getRotatingFileSink } from "@logtape/file";
import {
  configureSync,
  disposeSync,
  getConsoleSink,
  jsonLinesFormatter,
  type Logger as LogTapeLogger,
  type LogLevel as LogTapeLevel,
  getLogger,
} from "@logtape/logtape";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DaemonConfig } from "./config.ts";
import { VERSION } from "./version.ts";

type Fields = Record<string, unknown>;

export type Logger = {
  debug: (fields: Fields, message: string) => void;
  info: (fields: Fields, message: string) => void;
  warn: (fields: Fields, message: string) => void;
  error: (fields: Fields, message: string) => void;
  isLevelEnabled: (level: DaemonConfig["logLevel"]) => boolean;
};

const MAX_BYTES = 32 * 1024 * 1024;
const KEEP = 5;
const BASE = { app: "ho", version: VERSION };
const REDACTION_DEPTH = 4;
const REDACTED = "***";
const SECRET_NAME =
  /token|secret|password|passphrase|credential|authorization|bearer|cookie|session[-_]?key|api[-_]?key|private[-_]?key/iu;

const LEVELS: Readonly<Record<DaemonConfig["logLevel"], LogTapeLevel>> = {
  trace: "trace",
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

const redactValue = (value: unknown, depth: number): unknown => {
  if (depth <= 0 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth - 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) =>
      SECRET_NAME.test(key) ? [key, REDACTED] : [key, redactValue(nested, depth - 1)],
    ),
  );
};

const redact = (fields: Fields): Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) =>
      SECRET_NAME.test(key) ? [key, REDACTED] : [key, redactValue(value, REDACTION_DEPTH)],
    ),
  );

const adapt = (logger: LogTapeLogger): Logger => ({
  debug: (fields, message) => {
    logger.debug(message, () => redact(fields));
  },
  info: (fields, message) => {
    logger.info(message, () => redact(fields));
  },
  warn: (fields, message) => {
    logger.warn(message, () => redact(fields));
  },
  error: (fields, message) => {
    logger.error(message, () => redact(fields));
  },
  isLevelEnabled: (level) => logger.isEnabledFor(LEVELS[level]),
});

let current: Logger | null = null;

export const daemonLog = (): Logger | null => current;

export const createLogger = (
  level: DaemonConfig["logLevel"],
  file?: string,
): { log: Logger; close: () => void } => {
  if (file !== undefined) {
    mkdirSync(dirname(file), { recursive: true });
  }
  configureSync({
    reset: true,
    sinks: {
      daemon:
        file === undefined
          ? getConsoleSink({ formatter: jsonLinesFormatter })
          : getRotatingFileSink(file, {
              maxSize: MAX_BYTES,
              maxFiles: KEEP,
              formatter: jsonLinesFormatter,
              bufferSize: 0,
            }),
    },
    loggers: [
      { category: ["ho"], sinks: ["daemon"], lowestLevel: LEVELS[level] },
      { category: ["logtape", "meta"], sinks: [], lowestLevel: "error" },
    ],
  });
  current = adapt(getLogger(["ho"]).with(BASE));
  return { log: current, close: disposeSync };
};
