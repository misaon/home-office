import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/bun-ws";
import { errorMessage } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import type { RpcContext } from "./rpc/context.ts";
import { router } from "./rpc/router.ts";
import { McpGateway } from "./mcp.ts";
import { RunnerGateway, type RunnerSocketData } from "./runner-gateway.ts";
import { serveStatic } from "./static.ts";

export type ServerOptions = {
  host: string;
  port: number;
  token: string;
  context: RpcContext;
  gateway: RunnerGateway;
  mcp: McpGateway;
  log: Logger;
};

type SocketData = { kind: "rpc" } | RunnerSocketData;

const PROTOCOL_PREFIX = "ho.bearer.";

/** Browsers cannot set headers on WebSocket upgrades, so the token may also ride in a subprotocol. */
const presentedToken = (req: Request): { token: string; viaProtocol: boolean } | null => {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ") === true) {
    return { token: header.slice("Bearer ".length), viaProtocol: false };
  }
  const protocols =
    req.headers
      .get("sec-websocket-protocol")
      ?.split(",")
      .map((p) => p.trim()) ?? [];
  const match = protocols.find((p) => p.startsWith(PROTOCOL_PREFIX));
  return match === undefined
    ? null
    : { token: match.slice(PROTOCOL_PREFIX.length), viaProtocol: true };
};

const ASSETS_PREFIX = "/assets/";

/** The office UI bundle at `/` and sprite files at `/assets/`; both are read-only and unauthenticated (no data). */
function serveUi(options: ServerOptions, pathname: string): Promise<Response> | Response {
  const { dir, assetsDir } = options.context.config.ui;
  if (pathname.startsWith(ASSETS_PREFIX)) {
    return assetsDir === null
      ? new Response("not found", { status: 404 })
      : serveStatic(assetsDir, pathname.slice(ASSETS_PREFIX.length - 1), null);
  }
  return dir === null
    ? new Response("not found", { status: 404 })
    : serveStatic(dir, pathname, "index.html");
}

export function startServer(options: ServerOptions): { port: number; stop: () => Promise<void> } {
  const handler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        if (error instanceof ORPCError) {
          options.log.debug({ code: error.code, err: error.message }, "rpc call rejected");
          return;
        }
        options.log.error({ err: errorMessage(error) }, "rpc call failed");
      }),
    ],
  });
  const server = Bun.serve<SocketData>({
    hostname: options.host,
    port: options.port,
    fetch(req, srv) {
      const url = new URL(req.url);
      const origin = req.headers.get("origin");
      if (origin !== null && origin !== url.origin) {
        return new Response("forbidden origin", { status: 403 });
      }
      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      if (url.pathname === McpGateway.path) {
        return options.mcp.handle(req);
      }
      if (url.pathname === RunnerGateway.path) {
        const token = options.gateway.authorize(req);
        if (token === null) {
          options.log.warn({ ip: srv.requestIP(req)?.address }, "rejected runner connection");
          return new Response("unauthorized", { status: 401 });
        }
        return srv.upgrade(req, { data: { kind: "runner", token } })
          ? undefined
          : new Response("upgrade failed", { status: 500 });
      }
      if (url.pathname !== "/rpc") {
        return serveUi(options, url.pathname);
      }
      const presented = presentedToken(req);
      if (presented === null || presented.token !== options.token) {
        options.log.warn({ ip: srv.requestIP(req)?.address }, "rejected rpc connection");
        return new Response("unauthorized", { status: 401 });
      }
      // The handshake requires echoing the selected subprotocol when the client offered one.
      // Bun 1.4.2 rejects `headers: {}`, so pass headers only when there is something to send.
      const upgraded = presented.viaProtocol
        ? srv.upgrade(req, {
            data: { kind: "rpc" },
            headers: new Headers({
              "sec-websocket-protocol": `${PROTOCOL_PREFIX}${presented.token}`,
            }),
          })
        : srv.upgrade(req, { data: { kind: "rpc" } });
      return upgraded ? undefined : new Response("upgrade failed", { status: 500 });
    },
    websocket: {
      maxPayloadLength: 2 * 1024 * 1024,
      backpressureLimit: 4 * 1024 * 1024,
      closeOnBackpressureLimit: true,
      open(ws) {
        if (ws.data.kind === "runner") {
          options.gateway.open(ws.data.token, ws);
        }
      },
      async message(ws, message) {
        if (ws.data.kind === "runner") {
          options.gateway.message(ws.data.token, ws, message);
          return;
        }
        await handler.message(ws, message, { context: options.context });
      },
      close(ws) {
        if (ws.data.kind === "runner") {
          options.gateway.close(ws.data.token);
          return;
        }
        handler.close(ws);
      },
    },
  });
  options.log.info({ host: options.host, port: server.port }, "rpc server listening");
  return { port: server.port ?? options.port, stop: () => server.stop(true) };
}
