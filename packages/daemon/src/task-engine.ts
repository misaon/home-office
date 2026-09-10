import type { EngineMode, SandboxHandle, SandboxProvider, TaskEngineProvider } from "@ho/core";
import type { SessionId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./images.ts";

const MIB = 1024 * 1024;

/**
 * Where the engine exposes its API socket to the sandbox. The rootless daemon runs as uid 1000 and its
 * own runtime directory is the path it can write; the rootful one is root and gets a directory of ours,
 * with the socket's group set to the sandbox user.
 */
const SOCKET_DIR: Record<EngineMode, string> = {
  rootless: "/run/user/1000",
  rootful: "/run/ho",
};

const socketPathFor = (mode: EngineMode): string => `${SOCKET_DIR[mode]}/docker.sock`;

const engineNameFor = (sessionId: SessionId): string => `ho-engine-${sessionId.slice(-12)}`;
/** Images, layers, build cache and service volumes; kept per task so the next session starts warm. */
const cacheVolumeFor = (taskVolume: string): string => `${taskVolume}-engine`;
/** Runtime state, discarded with the session that produced it. */
const socketVolumeFor = (taskVolume: string, sessionId: SessionId): string =>
  `${taskVolume}-sock-${sessionId.slice(-8)}`;

/**
 * What a sandbox needs to use its engine. The two Testcontainers variables are its documented answers
 * for a Docker-in-Docker setup: the host is where published ports answer, which here is this container's
 * own loopback because the engine shares its network namespace, and the socket override is the path
 * Ryuk gets bind-mounted — the engine has no `/var/run/docker.sock` to offer it.
 */
export const engineEnv = (mode: EngineMode): Record<string, string> => ({
  DOCKER_HOST: `unix://${socketPathFor(mode)}`,
  TESTCONTAINERS_HOST_OVERRIDE: "localhost",
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: socketPathFor(mode),
});

/**
 * The socket directory is a tmpfs volume created with the sandbox user's ownership. A plain volume's
 * mount point is root-owned `0755` and the rootless daemon cannot create its socket there; chowning it
 * would need a capability every Home Office container drops. tmpfs also means the socket cannot outlive
 * the two containers that share it.
 */
const SOCKET_VOLUME_OPTS = {
  type: "tmpfs",
  device: "tmpfs",
  o: "uid=1000,gid=1000,mode=0700,size=1m",
};

export type TaskEngineRequest = {
  mode: EngineMode;
  sessionId: SessionId;
  /** Mounted at `/work` in both containers: relative bind mounts in a Compose file resolve through it. */
  taskVolume: string;
  labels: Readonly<Record<string, string>>;
};
/** Everything the sandbox spec needs to know before the engine itself exists. */
export type TaskEnginePlan = {
  mode: EngineMode;
  socketDir: string;
  socketVolume: string;
  cacheVolume: string;
};

/**
 * Creates the engine's volumes before the sandbox that mounts the same socket directory starts.
 * Creating them here also keeps them labelled: a volume Docker auto-creates for a missing mount
 * carries no labels and would never be collected.
 */
export async function prepareTaskEngine(
  provider: SandboxProvider,
  request: TaskEngineRequest,
): Promise<TaskEnginePlan> {
  const { mode, sessionId, taskVolume, labels } = request;
  const plan: TaskEnginePlan = {
    mode,
    socketDir: SOCKET_DIR[mode],
    socketVolume: socketVolumeFor(taskVolume, sessionId),
    cacheVolume: cacheVolumeFor(taskVolume),
  };
  await provider.createVolume(plan.cacheVolume, { ...labels, [LABELS.kind]: "engine-cache" });
  await provider.createVolume(
    plan.socketVolume,
    { ...labels, [LABELS.kind]: "engine-socket" },
    SOCKET_VOLUME_OPTS,
  );
  return plan;
}

/** Starts the engine in the sandbox's network namespace and waits until its API answers. */
export function startTaskEngine(
  provider: SandboxProvider & TaskEngineProvider,
  config: DaemonConfig,
  request: TaskEngineRequest,
  plan: TaskEnginePlan,
  sandbox: SandboxHandle,
): Promise<SandboxHandle> {
  return provider.startEngine(
    {
      name: engineNameFor(request.sessionId),
      image: plan.mode === "rootful" ? config.services.rootfulImage : config.services.image,
      mode: plan.mode,
      labels: { ...request.labels, [LABELS.kind]: "engine" },
      attachTo: sandbox,
      volumes: [
        { name: request.taskVolume, target: "/work" },
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
