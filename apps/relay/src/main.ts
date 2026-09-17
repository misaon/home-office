import { RELAY_MAX_FRAME_BYTES } from "@ho/protocol";
import { pino } from "pino";
import { RelayCore } from "./core.ts";
import type { RelaySocket } from "./state.ts";

const DEFAULT_PORT = 47850;
const IDLE_TIMEOUT_S = 120;

type SocketData = { socket: RelaySocket | null };

const log = pino({ level: Bun.env["RELAY_LOG_LEVEL"] ?? "info", base: { app: "ho-relay" } });
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
