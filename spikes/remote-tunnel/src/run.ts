import { HANDSHAKE_TIMEOUT_MS, waitForOpen } from "@ho/core";
import { type DaemonInfo, daemonUrl, readDaemonInfo } from "@ho/daemon";
import { type Contract, errorMessage } from "@ho/protocol";
import { connectDevice, pairDevice } from "@ho/remote";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Client = ContractRouterClient<Contract>;

const root = join(import.meta.dir, "..", "..", "..");
const checks: Record<string, boolean> = {};

const say = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

const check = (name: string, passed: boolean): void => {
  checks[name] = passed;
  say(`${passed ? "PASS" : "FAIL"} ${name}`);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitFor<T>(
  what: string,
  probe: () => Promise<T | null>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) {
      return value;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const forbidden = async (call: () => Promise<unknown>): Promise<boolean> => {
  try {
    await call();
    return false;
  } catch (error) {
    return error instanceof ORPCError && error.code === "FORBIDDEN";
  }
};

async function startRelay(): Promise<{ url: string; stop: () => void }> {
  const relay = Bun.spawn(["bun", "run", join(root, "apps/relay/src/main.ts")], {
    env: { ...Bun.env, RELAY_PORT: "0", RELAY_LOG_LEVEL: "info" },
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = relay.stdout.getReader();
  const decoder = new TextDecoder();
  const port = await waitFor("the relay port", async () => {
    const { value } = await reader.read();
    const match = /"port":(?<port>\d+)/u.exec(decoder.decode(value ?? new Uint8Array()));
    const found = match?.groups?.["port"];
    return found === undefined ? null : Number(found);
  });
  reader.releaseLock();
  return {
    url: `ws://127.0.0.1:${String(port)}/relay`,
    stop: () => {
      relay.kill();
    },
  };
}

async function startDaemon(home: string): Promise<{ info: DaemonInfo; stop: () => Promise<void> }> {
  await writeFile(
    join(home, "config.json"),
    JSON.stringify({
      port: 0,
      logLevel: "warn",
      docker: { socket: join(home, "no-docker.sock") },
    }),
  );
  const daemon = Bun.spawn(["bun", "run", join(root, "apps/cli/src/main.ts"), "daemon"], {
    env: { ...Bun.env, HO_HOME: home },
    stdout: "inherit",
    stderr: "inherit",
  });
  const info = await waitFor("the daemon", () => readDaemonInfo(home));
  return {
    info,
    stop: async () => {
      daemon.kill("SIGTERM");
      await daemon.exited;
    },
  };
}

async function ownerClient(info: DaemonInfo): Promise<{ client: Client; close: () => void }> {
  const websocket = new WebSocket(`${daemonUrl(info, "ws")}/rpc`, {
    headers: { authorization: `Bearer ${info.token}` },
  });
  await waitForOpen(websocket, AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS), "daemon unreachable");
  const client: Client = createORPCClient(new RPCLink({ websocket }));
  return {
    client,
    close: () => {
      websocket.close();
    },
  };
}

async function firstEvent(client: Client, afterSeq: number): Promise<string | null> {
  const events = await client.events.subscribe({ afterSeq }, { signal: AbortSignal.timeout(5000) });
  const iterator = events[Symbol.asyncIterator]();
  const first = await iterator.next();
  await iterator.return();
  return first.done === true ? null : first.value.type;
}

async function main(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "ho-remote-spike-"));
  const repo = join(home, "repo");
  await mkdir(repo);
  const relay = await startRelay();
  say(`relay at ${relay.url}`);
  const daemon = await startDaemon(home);
  say(`daemon at ${daemonUrl(daemon.info)} (home ${home})`);
  const owner = await ownerClient(daemon.info);
  try {
    const configured = await owner.client.remote.configure({ enabled: true, relayUrl: relay.url });
    check("owner enables remote control", configured.enabled && configured.relayUrl === relay.url);
    await waitFor("the daemon to reach the relay", async () => {
      const status = await owner.client.remote.status();
      return status.connected ? true : null;
    });
    check("daemon connects to the relay", true);
    const pairing = await owner.client.remote.pair({ name: "spike-phone" });
    check("pairing code has the HO1 prefix", pairing.code.startsWith("HO1-"));
    const credentials = await pairDevice({
      relayUrl: relay.url,
      code: pairing.code,
      name: "spike browser",
    });
    check("device enrols through the tunnel", credentials.instanceId === pairing.instanceId);
    const afterPairing = await owner.client.remote.status();
    check("pairing closes after one use", afterPairing.pairings.length === 0);
    const device = await connectDevice({ relayUrl: relay.url, credentials });
    const health = await device.client.system.health();
    check("device calls system.health end to end", health.ok);
    const withDevice = await owner.client.remote.status();
    check(
      "owner sees the device online",
      withDevice.devices.some(
        (known) =>
          known.id === credentials.deviceId && known.online && known.name === "spike-phone",
      ),
    );
    check(
      "secrets.status is forbidden remotely",
      await forbidden(() => device.client.secrets.status()),
    );
    check(
      "remote.pair is forbidden remotely",
      await forbidden(() => device.client.remote.pair({})),
    );
    check(
      "projects.create is forbidden remotely",
      await forbidden(() =>
        device.client.projects.create({ name: "x", repo: { kind: "local", path: repo } }),
      ),
    );
    const project = await owner.client.projects.create({
      name: "spike",
      repo: { kind: "local", path: repo },
    });
    const head = await device.client.events.head();
    const task = await device.client.tasks.create({
      projectId: project.id,
      title: "Remote smoke task",
    });
    check("device creates a task", task.title === "Remote smoke task");
    check(
      "device streams events through the tunnel",
      (await firstEvent(device.client, head.seq)) === "task.created",
    );
    const listed = await device.client.tasks.list({ projectId: project.id });
    check(
      "device lists the task",
      listed.some((known) => known.id === task.id),
    );
    await owner.client.remote.revoke({ deviceId: credentials.deviceId });
    const closed = await Promise.race([
      device.closed.then(() => true),
      sleep(5000).then(() => false),
    ]);
    check("revocation closes the live device connection", closed);
    let refusal = "";
    try {
      await connectDevice({ relayUrl: relay.url, credentials });
    } catch (error) {
      refusal = errorMessage(error);
    }
    check("revoked device cannot reconnect", refusal.includes("revoked"));
    device.close();
  } catch (error) {
    check(`no unexpected failure (${errorMessage(error)})`, false);
  } finally {
    owner.close();
    await daemon.stop();
    relay.stop();
    await rm(home, { recursive: true, force: true });
  }
  const failed = Object.values(checks).filter((passed) => !passed).length;
  say(`CHECKS ${JSON.stringify(checks)}`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
