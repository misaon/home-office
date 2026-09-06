/** Where agent sessions run. Docker locally today; a cloud provider tomorrow with the same shape. */

export type ImageSpec = {
  ref: string;
  contextDir: string;
  dockerfile?: string;
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

export type ProviderHealth =
  | { ok: true; version: string; apiVersion: string; os: string; arch: string }
  | { ok: false; message: string };

export type ResourceSnapshot = {
  containers: number;
  volumes: number;
  imagesBytes: number;
  volumesBytes: number;
};

export type BuildProgress = { line: string };

export type SandboxProvider = {
  readonly id: "docker" | (string & {});
  health: () => Promise<ProviderHealth>;
  ensureImage: (spec: ImageSpec, onProgress?: (p: BuildProgress) => void) => Promise<void>;
  ensureNetwork: (name: string, labels: Readonly<Record<string, string>>) => Promise<void>;
  createVolume: (name: string, labels: Readonly<Record<string, string>>) => Promise<VolumeRef>;
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
};
