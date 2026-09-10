// What a session needs before it can run: its volumes, its repository, its sandbox and its own engine.
import type { SandboxHandle, SandboxSpec } from "@ho/core";
import {
  type Agent,
  errorMessage,
  imageRefFor,
  type Project,
  PROVIDERS,
  type Session,
  type SessionServices,
  type Task,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { branchFor, prepareRepo, REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./images.ts";
import { sourcePathFor } from "./mirrors.ts";
import type { RunnerConnection } from "./runner-gateway.ts";
import type { SessionDeps } from "./sessions.ts";
import {
  engineEnv,
  prepareTaskEngine,
  startTaskEngine,
  type TaskEnginePlan,
  type TaskEngineRequest,
} from "./task-engine.ts";

export type SessionContext = {
  session: Session;
  task: Task;
  agent: Agent;
  project: Project;
  previous: Session | undefined;
  signal: AbortSignal;
};
export type Provisioned = {
  sandbox: SandboxHandle;
  /** The task's own container engine, when its project asked for one. */
  engine: SandboxHandle | null;
  /** Why the project's engine is absent, when one was asked for and could not be started. */
  engineFailure: string | null;
  connection: RunnerConnection;
  volume: string;
  branch: string;
  sourcePath: string;
  mcpToken: string;
};
const sandboxSpec = (
  config: DaemonConfig,
  ctx: SessionContext,
  volume: string,
  stateVolume: string,
  gatewayUrl: string,
  token: string,
  engine: TaskEnginePlan | null,
): SandboxSpec => ({
  name: `ho-session-${ctx.session.id.slice(-12)}`,
  image: imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
  cmd: ["bun", "/usr/local/bin/ho-runner.js"],
  env: {
    HO_GATEWAY: gatewayUrl,
    HO_SESSION_TOKEN: token,
    HOME: "/home/agent",
    TERM: "dumb",
    ...(engine === null ? {} : engineEnv(engine.mode)),
  },
  user: "1000:1000",
  workdir: REPO_IN_VOLUME,
  labels: {
    [LABELS.managed]: "true",
    [LABELS.kind]: "session",
    [LABELS.session]: ctx.session.id,
    [LABELS.project]: ctx.project.id,
  },
  network: config.docker.network,
  volumes: [
    { name: volume, target: "/work" },
    // The CLI's conversation state; survives between sessions of the same task and agent (resume).
    { name: stateVolume, target: PROVIDERS[ctx.agent.provider].stateDir },
    // The directory the task's engine puts its API socket in; `DOCKER_HOST` points inside it.
    ...(engine === null ? [] : [{ name: engine.socketVolume, target: engine.socketDir }]),
  ],
  binds: [],
  tmpfs: {
    "/tmp": "rw,nosuid,size=256m",
    // Docker mounts tmpfs as root 0755; the sandbox user must own its scratch directories.
    ...Object.fromEntries(
      PROVIDERS[ctx.agent.provider].scratchDirs.map((dir) => [
        dir,
        "rw,nosuid,size=128m,uid=1000,gid=1000,mode=0755",
      ]),
    ),
  },
  limits: {
    memoryBytes: config.limits.memoryMb * 1024 * 1024,
    cpus: config.limits.cpus,
    pids: config.limits.pids,
  },
  readonlyRootfs: true,
});

/** Absent means the project asks for no services; the brief and the session record share this answer. */
export function sessionServicesOf(provisioned: Provisioned): SessionServices | undefined {
  if (provisioned.engine !== null) {
    return "ready";
  }
  return provisioned.engineFailure === null ? undefined : "failed";
}

/** Network, task volume with the floor's repository, sandbox with the runner, runner connection. */
export async function provision(deps: SessionDeps, ctx: SessionContext): Promise<Provisioned> {
  const { provider, config, gateway, mcp, home } = deps;
  ctx.signal.throwIfAborted();
  const volume = `ho-task-${ctx.task.id.slice(-12)}`;
  const stateVolume = `${volume}-state-${ctx.agent.id.slice(-8)}`;
  const branch = ctx.task.artifacts.branch ?? branchFor(ctx.task.id);
  const labels = {
    [LABELS.managed]: "true",
    [LABELS.session]: ctx.session.id,
    [LABELS.project]: ctx.project.id,
  };
  await provider.ensureNetwork(config.docker.network, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "network",
  });
  await provider.createVolume(volume, { ...labels, [LABELS.kind]: "task-volume" });
  await provider.createVolume(stateVolume, { ...labels, [LABELS.kind]: "provider-state" });
  const sourcePath = await sourcePathFor(home, ctx.project);
  await prepareRepo(provider, config, sourcePath, ctx.project.defaultBranch, volume, branch);
  // Triage is the boss planning a message; it touches no code, so it gets no engine and no 2 GiB.
  const engineRequest: TaskEngineRequest | null =
    config.services.enabled && ctx.project.services.enabled && ctx.session.mode !== "triage"
      ? {
          mode: ctx.project.services.mode,
          sessionId: ctx.session.id,
          taskVolume: volume,
          labels,
        }
      : null;
  const plan = engineRequest === null ? null : await prepareTaskEngine(provider, engineRequest);
  const issued = gateway.issue(ctx.session.id, ctx.signal);
  const mcpToken = mcp.register({
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    agentId: ctx.agent.id,
    projectId: ctx.project.id,
    mode: ctx.session.mode,
  });
  let sandbox: SandboxHandle | null = null;
  let engine: SandboxHandle | null = null;
  try {
    ctx.signal.throwIfAborted();
    sandbox = await provider.start(
      sandboxSpec(config, ctx, volume, stateVolume, deps.gatewayUrl, issued.token, plan),
    );
    let engineFailure: string | null = null;
    if (engineRequest !== null && plan !== null) {
      // Fail soft: a session without its services still runs, and the brief says they are missing.
      try {
        engine = await startTaskEngine(provider, config, engineRequest, plan, sandbox);
      } catch (error) {
        engineFailure = errorMessage(error).slice(0, 500);
        deps.log.warn(
          { sessionId: ctx.session.id, err: engineFailure },
          "task engine did not start; the session continues without its services",
        );
      }
    }
    const connection = await issued.connected;
    ctx.signal.throwIfAborted();
    return { sandbox, engine, engineFailure, connection, volume, branch, sourcePath, mcpToken };
  } catch (error) {
    issued.cancel();
    mcp.unregister(mcpToken);
    if (engine !== null) {
      await provider.stopEngine(engine, 2).catch(() => null);
      await provider.remove(engine).catch(() => null);
    }
    if (sandbox !== null) {
      await provider.stop(sandbox, 2).catch(() => null);
      await provider.remove(sandbox).catch(() => null);
    }
    throw error;
  }
}
