// Spike S4: oRPC contract-first over WebSocket on Bun (server + client in one process).
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "./contract.ts";
import { startServer } from "./server.ts";

const token = crypto.randomUUID();
const server = startServer(token);

const websocket = new WebSocket(`ws://127.0.0.1:${server.port}`, {
  headers: { authorization: `Bearer ${token}` },
});
const link = new RPCLink({ websocket });
const client: ContractRouterClient<typeof contract> = createORPCClient(link);

const health = await client.system.health();
const sum = await client.math.add({ a: 2, b: 40 });
process.stdout.write(`health=${JSON.stringify(health)} sum=${sum.sum}\n`);

const COUNT = 1000;
const t0 = performance.now();
let received = 0;
const before = process.memoryUsage().heapUsed;
for await (const tick of await client.events.ticks({ count: COUNT })) {
  if (tick.seq !== received) {
    throw new Error(`out of order: expected ${received}, got ${tick.seq}`);
  }
  received += 1;
}
const elapsed = performance.now() - t0;
Bun.gc(true);
const after = process.memoryUsage().heapUsed;
process.stdout.write(
  `streamed ${received}/${COUNT} events in ${elapsed.toFixed(0)} ms (${((received / elapsed) * 1000).toFixed(0)} ev/s), heap delta ${((after - before) / 1024).toFixed(0)} KiB\n`,
);
if (received !== COUNT) {
  throw new Error("missing events");
}
websocket.close();
await server.stop();
