import type { EngineMode, SandboxHandle, SandboxProvider } from "@ho/core";
import type { SessionId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./labels.ts";

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
