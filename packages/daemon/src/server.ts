import { RPCHandler } from "@orpc/server/bun-ws";
import type { Logger } from "./logger.ts";
import type { RpcContext } from "./rpc/context.ts";
import { router } from "./rpc/router.ts";

export type ServerOptions = {
  host: string;
  port: number;
  token: string;
  context: RpcContext;
  log: Logger;
};

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

export function startServer(options: ServerOptions): { port: number; stop: () => Promise<void> } {
  const handler = new RPCHandler(router);
  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      if (url.pathname !== "/rpc") {
        return new Response("not found", { status: 404 });
      }
      const presented = presentedToken(req);
      if (presented === null || presented.token !== options.token) {
        options.log.warn({ ip: srv.requestIP(req)?.address }, "rejected rpc connection");
        return new Response("unauthorized", { status: 401 });
      }
      // The handshake requires echoing the selected subprotocol when the client offered one.
      // Bun 1.4.2 rejects `headers: {}`, so pass options only when there is something to send.
      const upgraded = presented.viaProtocol
        ? srv.upgrade(req, {
            headers: new Headers({
              "sec-websocket-protocol": `${PROTOCOL_PREFIX}${presented.token}`,
            }),
          })
        : srv.upgrade(req);
      return upgraded ? undefined : new Response("upgrade failed", { status: 500 });
    },
    websocket: {
      async message(ws, message) {
        await handler.message(ws, message, { context: options.context });
      },
      close(ws) {
        handler.close(ws);
      },
    },
  });
  options.log.info({ host: options.host, port: server.port }, "rpc server listening");
  return { port: server.port ?? options.port, stop: () => server.stop(true) };
}
