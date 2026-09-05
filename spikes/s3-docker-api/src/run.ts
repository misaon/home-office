// Spike S3: Docker Engine API from Bun + runner-connects-back over WebSocket.
import { resolve } from "node:path";
import { z } from "zod";
import { FromRunner, parseJson, type ToRunner } from "./protocol.ts";
import {
  ContainerList,
  Created,
  NetworkList,
  Version,
  VolumeCreated,
  VolumeList,
  demux,
  dockerJson,
  dockerRaw,
  imageExists,
  labelFilter,
  pullImage,
} from "./docker.ts";

const IMAGE = "ho/agent";
const TAG = "spike";
const LABELS = { "ho.managed": "true", "ho.kind": "spike" };
const RUNNER_DIR = resolve(import.meta.dir, "../out");

type Waiter = { resolve: (message: FromRunner) => void; reject: (error: Error) => void };

type RunnerConnection = {
  send: (message: ToRunner) => void;
  next: (timeoutMs: number) => Promise<FromRunner>;
};

type Gateway = { port: number; connected: Promise<RunnerConnection>; stop: () => Promise<void> };

function createInbox(): {
  push: (m: FromRunner) => void;
  next: (timeoutMs: number) => Promise<FromRunner>;
  fail: (e: Error) => void;
} {
  const queue: FromRunner[] = [];
  const waiters: Waiter[] = [];
  return {
    push: (message) => {
      const waiter = waiters.shift();
      if (waiter === undefined) {
        queue.push(message);
      } else {
        waiter.resolve(message);
      }
    },
    next: (timeoutMs) =>
      new Promise<FromRunner>((res, rej) => {
        const queued = queue.shift();
        if (queued !== undefined) {
          res(queued);
          return;
        }
        const timer = setTimeout(() => {
          rej(new Error("timeout waiting for runner"));
        }, timeoutMs);
        waiters.push({
          resolve: (message) => {
            clearTimeout(timer);
            res(message);
          },
          reject: rej,
        });
      }),
    fail: (error) => {
      for (const waiter of waiters.splice(0)) {
        waiter.reject(error);
      }
    },
  };
}

function createGateway(hostname: string, token: string): Gateway {
  const { promise: connected, resolve: resolveConnected } =
    Promise.withResolvers<RunnerConnection>();
  const inbox = createInbox();
  const server = Bun.serve({
    hostname,
    port: 0,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/runner" && req.headers.get("authorization") === `Bearer ${token}`) {
        if (srv.upgrade(req)) {
          return undefined;
        }
        return new Response("upgrade failed", { status: 500 });
      }
      return new Response("unauthorized", { status: 401 });
    },
    websocket: {
      open(ws) {
        resolveConnected({
          send: (message) => {
            ws.send(JSON.stringify(message));
          },
          next: inbox.next,
        });
      },
      message(_ws, raw) {
        inbox.push(parseJson(FromRunner, raw));
      },
      close() {
        inbox.fail(new Error("runner disconnected"));
      },
    },
  });
  return { port: server.port ?? 0, connected, stop: () => server.stop(true) };
}

type Names = { network: string; volume: string; container: string };

async function createSandbox(
  names: Names,
  gatewayPort: number,
  token: string,
): Promise<{ networkId: string; containerId: string }> {
  const networkId = (
    await dockerJson(Created, "POST", "/networks/create", {
      Name: names.network,
      Driver: "bridge",
      Options: { "com.docker.network.bridge.enable_icc": "false" },
      Labels: LABELS,
    })
  ).Id;
  await dockerJson(VolumeCreated, "POST", "/volumes/create", {
    Name: names.volume,
    Labels: LABELS,
  });
  const containerId = (
    await dockerJson(Created, "POST", `/containers/create?name=${names.container}`, {
      Image: `${IMAGE}:${TAG}`,
      Cmd: ["/opt/ho/ho-runner"],
      User: "1000:1000",
      WorkingDir: "/work",
      Env: [
        `HO_GATEWAY=ws://host.docker.internal:${gatewayPort}`,
        `HO_SESSION_TOKEN=${token}`,
        "HOME=/tmp",
      ],
      Labels: LABELS,
      HostConfig: {
        NetworkMode: names.network,
        ExtraHosts: ["host.docker.internal:host-gateway"],
        Binds: [`${RUNNER_DIR}:/opt/ho:ro`],
        Mounts: [{ Type: "volume", Source: names.volume, Target: "/work" }],
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,nosuid,size=64m" },
        Memory: 256 * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        PidsLimit: 128,
        Init: true,
      },
    })
  ).Id;
  await dockerRaw("POST", `/containers/${containerId}/start`);
  return { networkId, containerId };
}

async function exercise(runner: RunnerConnection): Promise<{ hello: string }> {
  const hello = await runner.next(5_000);
  if (hello.type !== "hello") {
    throw new Error(`expected hello, got ${hello.type}`);
  }
  runner.send({ type: "spawn", argv: ["cat"], env: {} });
  runner.send({ type: "stdin", data: "hello from container\n" });
  const echoed = await runner.next(5_000);
  if (echoed.type !== "stdout" || echoed.line !== "hello from container") {
    throw new Error(`unexpected echo: ${JSON.stringify(echoed)}`);
  }
  runner.send({ type: "stdin_close" });
  const exit = await runner.next(5_000);
  if (exit.type !== "exit" || exit.code !== 0) {
    throw new Error(`unexpected exit: ${JSON.stringify(exit)}`);
  }
  return {
    hello: `uid=${hello.uid} cwd=${hello.cwd} bun=${hello.bunVersion} host=${hello.hostname}`,
  };
}

async function dumpLogs(containerId: string): Promise<void> {
  const logs = await dockerRaw("GET", `/containers/${containerId}/logs?stdout=1&stderr=1`).catch(
    () => null,
  );
  if (logs === null) {
    return;
  }
  const { stdout, stderr } = demux(new Uint8Array(await logs.arrayBuffer()));
  process.stdout.write(
    `  container stdout: ${stdout.trim()}\n  container stderr: ${stderr.trim()}\n`,
  );
}

async function runOnce(bindHost: string): Promise<void> {
  const token = crypto.randomUUID();
  const gateway = createGateway(bindHost, token);
  const suffix = crypto.randomUUID().slice(0, 8);
  const names: Names = {
    network: `ho-spike-net-${suffix}`,
    volume: `ho-spike-vol-${suffix}`,
    container: `ho-spike-${suffix}`,
  };
  let ids: { networkId: string; containerId: string } | null = null;
  const t0 = performance.now();
  try {
    ids = await createSandbox(names, gateway.port, token);
    const tStarted = performance.now();
    const runner = await Promise.race([
      gateway.connected,
      new Promise<never>((_, rej) => {
        setTimeout(() => {
          rej(new Error("runner did not connect within 15s"));
        }, 15_000);
      }),
    ]);
    const { hello } = await exercise(runner);
    const tDone = performance.now();
    process.stdout.write(
      `bind=${bindHost} OK\n  runner: ${hello}\n  create+start: ${(tStarted - t0).toFixed(0)} ms, connect+echo+exit: ${(tDone - tStarted).toFixed(0)} ms, total: ${(tDone - t0).toFixed(0)} ms\n`,
    );
  } catch (error) {
    process.stdout.write(
      `bind=${bindHost} FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (ids !== null) {
      await dumpLogs(ids.containerId);
    }
  } finally {
    await gateway.stop();
    if (ids !== null) {
      await dockerRaw("DELETE", `/containers/${ids.containerId}?v=1&force=1`).catch(() => null);
    }
    await dockerRaw("DELETE", `/volumes/${names.volume}`).catch(() => null);
    if (ids !== null) {
      await dockerRaw("DELETE", `/networks/${ids.networkId}`).catch(() => null);
    }
  }
}

const version = await dockerJson(Version, "GET", "/version");
process.stdout.write(
  `docker ${version.Version} api ${version.ApiVersion} ${version.Os}/${version.Arch}\n`,
);
if (!(await imageExists(`${IMAGE}:${TAG}`))) {
  process.stdout.write(`pulling ${IMAGE}:${TAG}…\n`);
  await pullImage(IMAGE, TAG);
}

await runOnce("0.0.0.0");
await runOnce("127.0.0.1");

const filter = labelFilter(LABELS);
const leftovers = {
  containers: (await dockerJson(ContainerList, "GET", `/containers/json?all=1&filters=${filter}`))
    .length,
  volumes: (await dockerJson(VolumeList, "GET", `/volumes?filters=${filter}`)).Volumes?.length ?? 0,
  networks: (await dockerJson(NetworkList, "GET", `/networks?filters=${filter}`)).length,
};
process.stdout.write(`leftovers labelled ho.kind=spike: ${JSON.stringify(leftovers)}\n`);
z.object({ containers: z.literal(0), volumes: z.literal(0), networks: z.literal(0) }).parse(
  leftovers,
);
