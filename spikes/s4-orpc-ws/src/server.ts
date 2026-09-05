import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/bun-ws";
import { contract } from "./contract.ts";

const os = implement(contract);

export const router = os.router({
  system: {
    health: os.system.health.handler(() => ({ ok: true, now: new Date().toISOString() })),
  },
  math: {
    add: os.math.add.handler(({ input }) => ({ sum: input.a + input.b })),
  },
  events: {
    // oxlint-disable-next-line typescript/require-await -- a real implementation awaits event sources
    ticks: os.events.ticks.handler(async function* ({ input, signal }) {
      for (let seq = 0; seq < input.count; seq += 1) {
        signal?.throwIfAborted();
        yield { seq, at: performance.now() };
      }
    }),
  },
});

export function startServer(token: string): { port: number; stop: () => Promise<void> } {
  const handler = new RPCHandler(router);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      if (req.headers.get("authorization") !== `Bearer ${token}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return srv.upgrade(req) ? undefined : new Response("upgrade failed", { status: 500 });
    },
    websocket: {
      async message(ws, message) {
        await handler.message(ws, message, { context: {} });
      },
      close(ws) {
        handler.close(ws);
      },
    },
  });
  return { port: server.port ?? 0, stop: () => server.stop(true) };
}
