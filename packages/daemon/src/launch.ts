import { createIdFactory } from "@ho/core";
import { createDockerProvider } from "@ho/sandbox-docker";
import { createSecretStore } from "@ho/secrets";
import { recoverSessions } from "./recover-sessions.ts";
import { startBossVoice } from "./boss-voice.ts";
import { openOffice } from "./open-office.ts";
import { DaemonConfig, loadConfig } from "./config.ts";
import { type DaemonInfo, removeDaemonInfo, writeDaemonInfo } from "./daemon-info.ts";
import { buildsImages, resolveResources } from "./paths.ts";
import { createLogger } from "./logger.ts";
import { OfficeGate } from "./office-gate.ts";
import { createJobs } from "./jobs.ts";
import { McpGateway } from "./mcp.ts";
import { RunnerGateway } from "./runner-gateway.ts";
import { createRpcContext } from "./rpc/context.ts";
import { createRuntimes } from "./runtimes.ts";
import { startServer } from "./server.ts";
import { SessionManager } from "./sessions.ts";

import type { DaemonHandle, DaemonOptions } from "./index.ts";
import { VERSION } from "./version.ts";

export async function launchDaemon(
  options: DaemonOptions,
  home: string,
  cleanup: AsyncDisposableStack,
): Promise<DaemonHandle> {
  const resources = resolveResources(options.resourcesRoot);
  const config = DaemonConfig.parse({
    ...(await loadConfig(home, resources)),
    ...options.overrides,
  });
  const log = createLogger(config.logLevel, options.logFile);
  const clock = { now: () => new Date() };
  const ids = createIdFactory(clock, {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  });

  const { database, office } = await openOffice(home, resources.migrationsDir, ids, clock, log);
  cleanup.defer(() => {
    database.close();
  });
  const secrets = createSecretStore(home, config.secrets.store, (reason) => {
    log.warn({ reason }, "no OS credential store; using the file secret store");
  });
  const provider = createDockerProvider({
    socket: config.docker.socket,
    platform: config.docker.platform,
  });
  await recoverSessions(office, provider);
  const runtimes = createRuntimes(log, clock);
  const gateway = new RunnerGateway(clock, log);
  const mcp = new McpGateway(office, log);
  const gate = new OfficeGate(log);

  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const startedAt = clock.now().toISOString();
  // The port is known only after listening; sessions read the URL lazily through this holder.
  const gatewayUrl = { value: "" };
  const mcpUrl = { value: "" };
  const sessions = new SessionManager({
    office,
    provider,
    runtimes,
    gateway,
    mcp,
    secrets,
    config,
    home,
    log,
    get gatewayUrl() {
      return gatewayUrl.value;
    },
    get mcpUrl() {
      return mcpUrl.value;
    },
  });

  cleanup.defer(() => sessions.stopAll());
  const jobs = createJobs({ office, sessions, provider, config, gate, log });
  cleanup.defer(() => jobs.stop());
  const server = startServer({
    host: config.host,
    port: config.port,
    token,
    gateway,
    mcp,
    log,
    context: createRpcContext({
      office,
      sessions,
      gate,
      intake: jobs.intake,
      provider,
      secrets,
      config,
      resources,
      version: VERSION,
      startedAt,
      gc: jobs.gcOnce,
    }),
  });
  cleanup.defer(() => server.stop());
  gatewayUrl.value = `ws://${config.docker.gatewayHost}:${String(server.port)}`;
  mcpUrl.value = `http://${config.docker.gatewayHost}:${String(server.port)}${McpGateway.path}`;

  const info: DaemonInfo = {
    host: config.host,
    port: server.port,
    token,
    pid: process.pid,
    startedAt,
    version: VERSION,
    serves: { ui: resources.uiDir !== null, images: buildsImages(resources) },
  };
  await writeDaemonInfo(home, info);

  cleanup.defer(() => removeDaemonInfo(home));
  const voice = startBossVoice(office, gate, log);
  cleanup.defer(() => voice.stop());
  jobs.start();
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopping === null) {
      log.info("daemon stopping");
      stopping = cleanup.disposeAsync();
    }
    return stopping;
  };
  log.info({ home, resources: resources.root }, "daemon started");
  return { info, office, config, stop };
}
