import type {
  ProviderHealth,
  ResourceInventory,
  ResourceSnapshot,
  ServicesPolicy,
} from "@ho/protocol";

/** Where agent sessions run. Docker locally today; a cloud provider tomorrow with the same shape. */

export type ImageSpec = {
  ref: string;
  contextDir: string;
  dockerfile?: string;
  /** Multi-stage build target (provider variants share one Dockerfile). */
  target?: string;
  platform?: string;
  labels: Readonly<Record<string, string>>;
  /** Content hash of the build inputs; the provider skips the build when an image with this label exists. */
  contentHash: string;
};

export type VolumeMount = { name: string; target: string; readonly?: boolean };
export type BindMount = { source: string; target: string; readonly: boolean };

export type SandboxSpec = {
  name: string;
  image: string;
  cmd: readonly string[];
  env: Readonly<Record<string, string>>;
  user: string;
  workdir: string;
  labels: Readonly<Record<string, string>>;
  network: string;
  volumes: readonly VolumeMount[];
  /** Host paths are reserved for the git-bridge; agent sandboxes must not use them. */
  binds: readonly BindMount[];
  tmpfs: Readonly<Record<string, string>>;
  limits: { memoryBytes: number; cpus: number; pids: number };
  readonlyRootfs: boolean;
};

export type SandboxHandle = { id: string; name: string };
export type VolumeRef = { name: string };

export type EngineMode = ServicesPolicy["mode"];

/**
 * A private container engine for one task, so a repository's own Compose file runs unmodified. The
 * daemon owns the names and the budget; the adapter owns how a mode is realised (which image, where its
 * data root is, how it exposes the socket).
 */
export type EngineSpec = {
  name: string;
  image: string;
  mode: EngineMode;
  labels: Readonly<Record<string, string>>;
  /** The sandbox whose network namespace the engine joins, so published ports land on its loopback. */
  attachTo: SandboxHandle;
  /** Mounted at the same targets as in that sandbox: relative bind mounts in a Compose file need it. */
  volumes: readonly VolumeMount[];
  /** Holds the engine's images, layers, build cache and service volumes between sessions of one task. */
  cacheVolume: string;
  /** Directory shared with the sandbox in which the engine exposes `docker.sock`. */
  socketDir: string;
  /** Caps the whole environment: nested containers share the engine's cgroup. */
  limits: { memoryBytes: number; cpus: number; pids: number };
};

export type SandboxRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type PruneScope = {
  labels: Readonly<Record<string, string>>;
  olderThanMs?: number;
  kinds: readonly ("containers" | "volumes" | "images")[];
};
export type PruneReport = { containers: string[]; volumes: string[]; images: string[] };

export type { ProviderHealth, ResourceInventory, ResourceSnapshot } from "@ho/protocol";

export type BuildProgress = { line: string };

export type SandboxProvider = {
  readonly id: "docker";
  health: () => Promise<ProviderHealth>;
  ensureImage: (spec: ImageSpec, onProgress?: (p: BuildProgress) => void) => Promise<void>;
  ensureNetwork: (name: string, labels: Readonly<Record<string, string>>) => Promise<void>;
  createVolume: (
    name: string,
    labels: Readonly<Record<string, string>>,
    /** `local` driver mount options, e.g. a tmpfs volume owned by the sandbox user. */
    driverOpts?: Readonly<Record<string, string>>,
  ) => Promise<VolumeRef>;
  removeVolume: (ref: VolumeRef) => Promise<void>;
  /** Creates and starts a long-lived sandbox (the runner is its PID 1). */
  start: (spec: SandboxSpec) => Promise<SandboxHandle>;
  stop: (handle: SandboxHandle, graceSeconds?: number) => Promise<void>;
  remove: (handle: SandboxHandle) => Promise<void>;
  /** Runs a short one-shot container to completion and removes it (git-bridge, smoke checks). */
  run: (spec: SandboxSpec, timeoutMs?: number) => Promise<SandboxRunResult>;
  logs: (handle: SandboxHandle, tail?: number) => Promise<{ stdout: string; stderr: string }>;
  prune: (scope: PruneScope) => Promise<PruneReport>;
  snapshot: (labels: Readonly<Record<string, string>>) => Promise<ResourceSnapshot>;
  /** Everything HO owns right now, for the Resources panel and `ho resources`. */
  inventory: (labels: Readonly<Record<string, string>>) => Promise<ResourceInventory>;
};

/**
 * The optional second execution boundary: an engine per task instead of the daemon's own. A microVM
 * backend implements this without implementing `SandboxProvider`, which is why it is a separate port.
 */
export type TaskEngineProvider = {
  /** Starts the engine and resolves once its API answers; rejects on timeout or a dead container. */
  startEngine: (spec: EngineSpec, readyTimeoutMs: number) => Promise<SandboxHandle>;
  /** Stops the engine so its own containers get their termination signal before the sandbox goes. */
  stopEngine: (handle: SandboxHandle, graceSeconds?: number) => Promise<void>;
};
