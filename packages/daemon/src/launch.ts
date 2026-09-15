import { createGithubIssuesConnector } from "@ho/intake-github";
import { createDockerProvider } from "@ho/sandbox-docker";
import { createSecretStore } from "@ho/secrets";
import { DaemonConfig, loadConfig } from "./config.ts";
import { type DaemonInfo, removeDaemonInfo, writeDaemonInfo } from "./daemon-info.ts";
import { startFloorJobs } from "./floor-jobs.ts";
import { startGc } from "./gc.ts";
import { type DirectoryPicker, osascriptDirectoryPicker } from "./host-dialog.ts";
import { IntakeService } from "./intake.ts";
import { createLogger } from "./logger.ts";
import { McpGateway } from "./mcp.ts";
import { OfficeGate } from "./office-gate.ts";
import { openOffice } from "./office.ts";
import { buildsImages, resolveResources } from "./paths.ts";
import { RunnerGateway } from "./runner-gateway.ts";
import { createRuntimes } from "./runtimes.ts";
import { startServer } from "./server.ts";
import { SessionManager } from "./sessions.ts";
import { VERSION } from "./version.ts";

/** How long `stop()` waits for sessions, jobs and the server before giving up on them. */
const STOP_TIMEOUT_MS = 20_000;

export type DaemonHandle = {
  info: DaemonInfo;
  config: DaemonConfig;
  /** Stops sessions, jobs and the server, removes daemon.json and releases the lock; bounded by 20 s. */
  stop: () => Promise<void>;
};

export type DaemonOptions = {
  /** State directory (config.json, ho.db, daemon.json, logs/); defaults to `HO_HOME` or `~/.config/home-office`. */
  home?: string;
  overrides?: Partial<DaemonConfig>;
  /** Where image contexts and the UI bundle live; defaults to the repository. */
  resourcesRoot?: string;
  /** Log to this file instead of stdout (the desktop app has no visible stdout). */
  logFile?: string;
  /**
   * Shows the host's directory dialog. The desktop app injects a panel owned by its own window;
   * without one the daemon falls back to macOS `osascript`.
   */
  pickDirectory?: DirectoryPicker;
};

const withDeadline = (work: Promise<void>, ms: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`daemon did not stop within ${String(ms)} ms`));
    }, ms);
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });

/** Everything the daemon is made of, wired in dependency order; `cleanup` unwinds it in reverse. */
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
  const { log, close: closeLog } = createLogger(config.logLevel, options.logFile);
  cleanup.defer(closeLog);
  const clock = { now: () => new Date() };
  const { office, attachments, close: closeStore } = await openOffice(home, clock, log);
  cleanup.defer(closeStore);
  const secrets = createSecretStore(home, config.secrets.store, (reason) => {
    log.warn({ reason }, "no OS credential store; using the file secret store");
  });
  const provider = createDockerProvider({
    socket: config.docker.socket,
    platform: config.docker.platform,
  });
  const gateway = new RunnerGateway(log);
  const mcp = new McpGateway(office, log);
  const gate = new OfficeGate(log);
  // The port is known only after listening; sessions read the URLs lazily.
  let { port } = config;
  const sessions = new SessionManager({
    office,
    provider,
    runtimes: createRuntimes(log, clock),
    gateway,
    mcp,
    attachments,
    secrets,
    config,
    home,
    log,
    gatewayUrl: () => `ws://${config.docker.gatewayHost}:${String(port)}`,
    mcpUrl: () => `http://${config.docker.gatewayHost}:${String(port)}${McpGateway.path}`,
  });
  await sessions.recover();
  const intake = new IntakeService(office, createGithubIssuesConnector(), log);
  const gc = startGc(provider, config, log);
  cleanup.defer(() => gc.stop());
  const startedAt = clock.now().toISOString();
  const server = startServer({
    host: config.host,
    port: config.port,
    uiDir: config.ui.dir,
    gateway,
    mcp,
    log,
    context: {
      office,
      sessions,
      attachments,
      gate,
      intake,
      provider,
      secrets,
      config,
      home,
      resources,
      version: VERSION,
      startedAt,
      gc: gc.runOnce,
      pickDirectory: options.pickDirectory ?? osascriptDirectoryPicker,
      log,
    },
  });
  // One callback, because the order matters: sessions end (stdin, SIGTERM, SIGKILL, settle) while their
  // runner sockets are still open, and only then does the server force the rest of its connections shut.
  cleanup.defer(async () => {
    await sessions.stopAll();
    await server.stop();
  });
  ({ port } = server);
  const info: DaemonInfo = {
    host: config.host,
    port,
    token: server.token,
    pid: process.pid,
    startedAt,
    version: VERSION,
    serves: { ui: config.ui.dir !== null, images: buildsImages(resources) },
  };
  await writeDaemonInfo(home, info);
  cleanup.defer(() => removeDaemonInfo(home));
  intake.start();
  cleanup.defer(() => intake.stop());
  // Last, so a floor its own `.ho/config.json` changes is applied against a daemon already up.
  const jobs = startFloorJobs({ office, sessions, config, gate, home, log });
  cleanup.defer(() => jobs.stop());
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopping === null) {
      log.info("daemon stopping");
      stopping = withDeadline(cleanup.disposeAsync(), STOP_TIMEOUT_MS);
    }
    return stopping;
  };
  log.info({ home, resources: resources.root }, "daemon started");
  return { info, config, stop };
}
