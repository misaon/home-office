import type { EngineMode, SandboxHandle, SandboxProvider } from "@ho/core";
import { errorMessage, servicesAvailable, type SessionId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./labels.ts";
import type { Services } from "./prompts-shared.ts";
import type { SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";

const MIB = 1024 * 1024;

const SOCKET_DIR: Record<EngineMode, string> = {
  rootless: "/run/user/1000",
  rootful: "/run/ho",
};

type EngineRole = "session" | "verify";

const socketPathFor = (mode: EngineMode): string => `${SOCKET_DIR[mode]}/docker.sock`;

const engineNameFor = (role: EngineRole, sessionId: SessionId): string =>
  `ho-${role === "verify" ? "verify-engine" : "engine"}-${sessionId.slice(-12)}`;
const cacheVolumeFor = (workVolume: string): string => `${workVolume}-engine`;
const socketVolumeFor = (role: EngineRole, workVolume: string, sessionId: SessionId): string =>
  `${workVolume}-${role === "verify" ? "vsock" : "sock"}-${sessionId.slice(-8)}`;

export const engineEnv = (mode: EngineMode): Record<string, string> => ({
  DOCKER_HOST: `unix://${socketPathFor(mode)}`,
  TESTCONTAINERS_HOST_OVERRIDE: "localhost",
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: socketPathFor(mode),
});

const SOCKET_VOLUME_OPTS = {
  type: "tmpfs",
  device: "tmpfs",
  o: "uid=1000,gid=1000,mode=0700,size=1m",
};

export type TaskEngineRequest = {
  mode: EngineMode;
  role: EngineRole;
  sessionId: SessionId;
  workVolume: string;
  labels: Readonly<Record<string, string>>;
};
export type TaskEnginePlan = {
  mode: EngineMode;
  socketDir: string;
  socketVolume: string;
  cacheVolume: string;
};

export async function prepareTaskEngine(
  provider: SandboxProvider,
  request: TaskEngineRequest,
  stack: AsyncDisposableStack,
): Promise<TaskEnginePlan> {
  const { mode, role, sessionId, workVolume, labels } = request;
  const plan: TaskEnginePlan = {
    mode,
    socketDir: SOCKET_DIR[mode],
    socketVolume: socketVolumeFor(role, workVolume, sessionId),
    cacheVolume: cacheVolumeFor(workVolume),
  };
  await provider.createVolume(plan.cacheVolume, { ...labels, [LABELS.kind]: "engine-cache" });
  await provider.createVolume(
    plan.socketVolume,
    { ...labels, [LABELS.kind]: "engine-socket" },
    SOCKET_VOLUME_OPTS,
  );
  stack.defer(() => provider.removeVolume(plan.socketVolume));
  return plan;
}

export function startTaskEngine(
  provider: SandboxProvider,
  config: DaemonConfig,
  request: TaskEngineRequest,
  plan: TaskEnginePlan,
  sandbox: SandboxHandle,
): Promise<SandboxHandle> {
  return provider.startEngine(
    {
      name: engineNameFor(request.role, request.sessionId),
      image: plan.mode === "rootful" ? config.services.rootfulImage : config.services.image,
      mode: plan.mode,
      labels: { ...request.labels, [LABELS.kind]: "engine" },
      attachTo: sandbox,
      volumes: [
        { name: request.workVolume, target: "/work" },
        { name: plan.socketVolume, target: plan.socketDir },
      ],
      cacheVolume: plan.cacheVolume,
      socketDir: plan.socketDir,
      limits: {
        memoryBytes: config.services.memoryMb * MIB,
        cpus: config.services.cpus,
        pids: config.services.pids,
      },
    },
    config.services.startTimeoutMs,
  );
}

const ENGINE_STOP_GRACE_S = 15;

export type Engine = { services: Services; stop: () => Promise<void> };

export async function startServices(
  deps: SessionDeps,
  ctx: SessionContext,
  request: TaskEngineRequest | null,
  plan: TaskEnginePlan | null,
  sandbox: SandboxHandle,
  stack: AsyncDisposableStack,
): Promise<Engine> {
  const none = { stop: () => Promise.resolve() };
  if (request === null || plan === null) {
    const wanted =
      deps.config.services.enabled &&
      ctx.project.services.enabled &&
      (ctx.session.mode === "work" || ctx.session.mode === "review");
    return {
      ...none,
      services:
        wanted && !servicesAvailable(ctx.project.services)
          ? { kind: "untrusted" }
          : { kind: "off" },
    };
  }
  try {
    const engine = await startTaskEngine(deps.provider, deps.config, request, plan, sandbox);
    let stopped: Promise<void> | null = null;
    const stop = (): Promise<void> => {
      stopped ??= (async () => {
        await deps.provider.stop(engine, ENGINE_STOP_GRACE_S).catch(() => null);
        await deps.provider.remove(engine).catch(() => null);
      })();
      return stopped;
    };
    stack.defer(stop);
    return { services: { kind: "ready" }, stop };
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    deps.log.warn(
      { sessionId: ctx.session.id, err: message },
      "task engine did not start; the session continues without its services",
    );
    return { ...none, services: { kind: "failed", message } };
  }
}
