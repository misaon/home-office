import { describeDomainError, errorMessage } from "@ho/protocol";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/bun-ws";
import { timingSafeEqual } from "node:crypto";
import type { AttachmentStore } from "./attachments.ts";
import type { Logger } from "./logger.ts";
import { McpGateway } from "./mcp.ts";
import type { RpcContext } from "./rpc/context.ts";
import { router } from "./rpc/router.ts";
import { RunnerGateway, type RunnerSocketData } from "./runner-gateway.ts";
import { bearerToken, mintToken } from "./token.ts";
import { serveStatic } from "./static.ts";

export type ServerOptions = {
  host: string;
  port: number;
  uiDir: string | null;
  context: RpcContext;
  gateway: RunnerGateway;
  mcp: McpGateway;
  log: Logger;
};

type SocketData = { kind: "rpc" } | RunnerSocketData;

const PROTOCOL_PREFIX = "ho.bearer.";

const presentedToken = (req: Request): { token: string; viaProtocol: boolean } | null => {
  const header = bearerToken(req);
  if (header !== null) {
    return { token: header, viaProtocol: false };
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

const encoder = new TextEncoder();

const sameToken = (presented: string, expected: string): boolean => {
  const a = encoder.encode(presented);
  const b = encoder.encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const ATTACHMENTS_PATH = "/attachments";
const FILENAME_HEADER = "x-ho-filename";

async function serveAttachment(req: Request, url: URL, store: AttachmentStore): Promise<Response> {
  if (req.method === "POST" && url.pathname === ATTACHMENTS_PATH) {
    const encoded = req.headers.get(FILENAME_HEADER);
    if (encoded === null) {
      return new Response(`expected the file name in ${FILENAME_HEADER}`, { status: 400 });
    }
    const name = Buffer.from(encoded, "base64url").toString("utf8");
    const stored = await store.put(name, new Uint8Array(await req.arrayBuffer()));
    return stored.ok
      ? Response.json(stored.value)
      : new Response(describeDomainError(stored.error), { status: 400 });
  }
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }
  const found = await store.get(url.pathname.slice(ATTACHMENTS_PATH.length + 1));
  if (!found.ok) {
    return new Response("not found", { status: 404 });
  }
  return new Response(found.value, {
    headers: {
      "content-type": "application/octet-stream",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "content-disposition": "attachment",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

const serveUi = (uiDir: string | null, pathname: string): Promise<Response> | Response =>
  uiDir === null
    ? new Response(
        "this build carries no office UI bundle; use the desktop app or run the daemon from a source checkout",
        { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
      )
    : serveStatic(uiDir, pathname, "index.html");

export function startServer(options: ServerOptions): {
  port: number;
  token: string;
  stop: () => Promise<void>;
} {
  const token = mintToken();
  const handler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        if (error instanceof ORPCError && error.code !== "INTERNAL_SERVER_ERROR") {
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
        const runnerToken = options.gateway.authorize(req);
        if (runnerToken === null) {
          options.log.warn({ ip: srv.requestIP(req)?.address }, "rejected runner connection");
          return new Response("unauthorized", { status: 401 });
        }
        return srv.upgrade(req, { data: { kind: "runner", token: runnerToken } })
          ? undefined
          : new Response("upgrade failed", { status: 500 });
      }
      if (url.pathname === ATTACHMENTS_PATH || url.pathname.startsWith(`${ATTACHMENTS_PATH}/`)) {
        return sameToken(bearerToken(req) ?? "", token)
          ? serveAttachment(req, url, options.context.attachments)
          : new Response("unauthorized", { status: 401 });
      }
      if (url.pathname !== "/rpc") {
        return serveUi(options.uiDir, url.pathname);
      }
      const presented = presentedToken(req);
      if (presented === null || !sameToken(presented.token, token)) {
        options.log.warn({ ip: srv.requestIP(req)?.address }, "rejected rpc connection");
        return new Response("unauthorized", { status: 401 });
      }
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
          options.gateway.message(ws.data.token, message);
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
  return { port: server.port ?? options.port, token, stop: () => server.stop(true) };
}
