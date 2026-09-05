// Spike S2 main process (Bun runtime inside Electrobun): proves bun:sqlite, Bun.serve WebSocket,
// fetch over the Docker unix socket and typed RPC with a PixiJS webview.
import { Database } from "bun:sqlite";
import { BrowserView, BrowserWindow } from "electrobun/main";
import type { Report, SpikeRPC } from "../rpc.ts";

const log = (text: string): void => {
  process.stdout.write(`[s2-main] ${text}\n`);
};

// 1. bun:sqlite
const db = new Database(":memory:");
db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT NOT NULL)");
db.prepare("INSERT INTO events (type) VALUES (?)").run("task.created");
const row = db.query<{ n: number }, []>("SELECT count(*) AS n FROM events").get();
const sqliteOk = row?.n === 1;

// 2. Docker Engine API over the unix socket
let dockerVersion = "unreachable";
try {
  const res = await fetch("http://docker/v1.55/version", { unix: "/var/run/docker.sock" });
  const json: unknown = await res.json();
  dockerVersion =
    typeof json === "object" &&
    json !== null &&
    "Version" in json &&
    typeof json.Version === "string"
      ? json.Version
      : "unknown";
} catch (error) {
  dockerVersion = `error: ${error instanceof Error ? error.message : String(error)}`;
}

// 3. Bun.serve WebSocket echo gateway on loopback
const token = crypto.randomUUID();
const gateway = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") === token && server.upgrade(req)) {
      return undefined;
    }
    return new Response("unauthorized", { status: 401 });
  },
  websocket: {
    message(ws, message) {
      ws.send(message);
    },
  },
});
const gatewayUrl = `ws://127.0.0.1:${gateway.port}/?token=${token}`;

let finished = false;
const finish = (report: Report | null): void => {
  if (finished) {
    return;
  }
  finished = true;
  const result = {
    bun: Bun.version,
    sqliteOk,
    dockerVersion,
    gatewayPort: gateway.port,
    report,
  };
  process.stdout.write(`S2 RESULT ${JSON.stringify(result)}\n`);
  // Release builds have no visible stdout; leave the result where the spike runner can read it.
  void Bun.write(`${Bun.env["TMPDIR"] ?? "/tmp"}/ho-spike-s2-result.json`, JSON.stringify(result));
  setTimeout(() => {
    process.exit(report === null ? 1 : 0);
  }, 300);
};

// 4. Typed RPC with the webview
const rpc = BrowserView.defineRPC<SpikeRPC>({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      getGatewayInfo: () => ({ url: gatewayUrl }),
    },
    messages: {
      report: (report) => {
        finish(report);
      },
      log: ({ text }) => {
        log(`webview: ${text}`);
      },
    },
  },
});

const win = new BrowserWindow({
  title: "Home Office — spike S2",
  url: "views://mainview/index.html",
  frame: { width: 960, height: 640, x: 120, y: 120 },
  rpc,
});
log(
  `window created id=${String(win.id)} bun=${Bun.version} sqliteOk=${String(sqliteOk)} docker=${dockerVersion} gateway=${String(gateway.port)}`,
);

setTimeout(() => {
  log("timeout waiting for the webview report");
  finish(null);
}, 25_000);
