import { RELAY_MAX_FRAME_BYTES } from "@ho/protocol";
import {
  configureSync,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
  type LogLevel,
} from "@logtape/logtape";
import { RelayCore } from "./core.ts";
import type { RelayLog, RelaySocket } from "./state.ts";

const DEFAULT_PORT = 47850;
const IDLE_TIMEOUT_S = 120;

type SocketData = { socket: RelaySocket | null };

const LEVELS: Readonly<Record<string, LogLevel>> = {
  trace: "trace",
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};
const REDACTED = "***";
const URL_CREDENTIALS = /\/\/[^\s/@]+@/gu;
const NAME_SEPARATORS = /[^A-Za-z0-9]+/u;
const CAMEL_BOUNDARY = /(?=[A-Z])/u;
const SECRET_WORDS: ReadonlySet<string> = new Set([
  "authorization",
  "bearer",
  "cookie",
  "credential",
  "credentials",
  "passphrase",
  "password",
  "secret",
  "token",
]);

const isSecretName = (name: string): boolean =>
  name
    .split(NAME_SEPARATORS)
    .flatMap((segment) =>
      segment === segment.toUpperCase() ? [segment] : segment.split(CAMEL_BOUNDARY),
    )
    .some((part) => SECRET_WORDS.has(part.toLowerCase()));

const redact = (fields: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields).map(([name, value]) =>
      isSecretName(name)
        ? [name, REDACTED]
        : [name, typeof value === "string" ? value.replaceAll(URL_CREDENTIALS, "//***@") : value],
    ),
  );

configureSync({
  reset: true,
  sinks: { relay: getConsoleSink({ formatter: jsonLinesFormatter }) },
  loggers: [
    {
      category: ["ho-relay"],
      sinks: ["relay"],
      lowestLevel: LEVELS[Bun.env["RELAY_LOG_LEVEL"] ?? "info"] ?? "info",
    },
    { category: ["logtape", "meta"], sinks: [], lowestLevel: "error" },
  ],
});

const relayLogger = getLogger(["ho-relay"]).with({ app: "ho-relay" });
const log: RelayLog = {
  info: (fields, message) => {
    relayLogger.info(message, () => redact(fields));
  },
  warn: (fields, message) => {
    relayLogger.warn(message, () => redact(fields));
  },
};
const core = new RelayCore(log);
const allowedOrigins = (Bun.env["RELAY_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");

const originAllowed = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return origin === null || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
};

const server = Bun.serve<SocketData>({
  hostname: Bun.env["RELAY_HOST"] ?? "127.0.0.1",
  port: Number(Bun.env["RELAY_PORT"] ?? DEFAULT_PORT),
  fetch(request, bunServer) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, instances: core.instances });
    }
    if (url.pathname !== "/relay") {
      return new Response("not found", { status: 404 });
    }
    if (!originAllowed(request)) {
      return new Response("forbidden origin", { status: 403 });
    }
    return bunServer.upgrade(request, { data: { socket: null } })
      ? undefined
      : new Response("upgrade failed", { status: 500 });
  },
  websocket: {
    maxPayloadLength: RELAY_MAX_FRAME_BYTES,
    idleTimeout: IDLE_TIMEOUT_S,
    open(ws) {
      const socket: RelaySocket = {
        send: (text) => {
          ws.send(text);
        },
        close: (code, reason) => {
          ws.close(code, reason);
        },
      };
      ws.data.socket = socket;
      core.open(socket);
    },
    message(ws, message) {
      if (ws.data.socket === null) {
        return;
      }
      if (typeof message !== "string") {
        ws.close(1003, "text frames only");
        return;
      }
      void core.message(ws.data.socket, message);
    },
    close(ws) {
      if (ws.data.socket !== null) {
        core.close(ws.data.socket);
      }
    },
  },
});

log.info({ host: server.hostname, port: server.port }, "relay listening");
