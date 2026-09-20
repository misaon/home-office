import type { ProviderHealth, ResourceInventory, ServicesPolicy } from "@ho/protocol";
import type { Cancellation } from "./ports.ts";

export type ImageSpec = {
  ref: string;
  contextDir: string;
  target?: string;
  labels: Readonly<Record<string, string>>;
  contentHash: string;
};

export type VolumeMount = { name: string; target: string; readonly?: boolean };
type BindMount = { source: string; target: string; readonly: boolean };

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
  binds: readonly BindMount[];
  tmpfs: Readonly<Record<string, string>>;
  limits: { memoryBytes: number; cpus: number; pids: number };
  readonlyRootfs: boolean;
  ports: readonly number[];
};

export type SandboxHandle = { id: string; name: string };

export type EngineMode = ServicesPolicy["mode"];

export type EngineSpec = {
  name: string;
  image: string;
  mode: EngineMode;
  labels: Readonly<Record<string, string>>;
  attachTo: SandboxHandle;
  volumes: readonly VolumeMount[];
  cacheVolume: string;
  socketDir: string;
  limits: { memoryBytes: number; cpus: number; pids: number };
};

export type SandboxRunResult = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

export type PruneScope = {
  labels: Readonly<Record<string, string>>;
  olderThanMs?: number;
  kinds: readonly ("containers" | "volumes" | "images")[];
  keep?: (name: string) => boolean;
};
export type PruneReport = { containers: string[]; volumes: string[]; images: string[] };

export type SandboxState = {
  running: boolean;
  exitCode: number;
  oomKilled: boolean;
  error: string;
};

export type SandboxProvider = {
  readonly id: "docker";
  health: () => Promise<ProviderHealth>;
  imageHash: (ref: string) => Promise<string | null>;
  ensureImage: (
    spec: ImageSpec,
    onLine?: (line: string) => void,
    signal?: Cancellation,
  ) => Promise<void>;
  ensureNetwork: (name: string, labels: Readonly<Record<string, string>>) => Promise<void>;
  createVolume: (
    name: string,
    labels: Readonly<Record<string, string>>,
    driverOpts?: Readonly<Record<string, string>>,
  ) => Promise<void>;
  removeVolume: (name: string) => Promise<void>;
  start: (spec: SandboxSpec) => Promise<SandboxHandle>;
  startEngine: (spec: EngineSpec, readyTimeoutMs: number) => Promise<SandboxHandle>;
  stop: (handle: SandboxHandle, graceSeconds?: number) => Promise<void>;
  remove: (handle: SandboxHandle) => Promise<void>;
  inspect: (handle: SandboxHandle) => Promise<SandboxState>;
  run: (spec: SandboxSpec, timeoutMs?: number) => Promise<SandboxRunResult>;
  wait: (handle: SandboxHandle, timeoutMs: number) => Promise<SandboxRunResult>;
  prune: (scope: PruneScope) => Promise<PruneReport>;
  inventory: (labels: Readonly<Record<string, string>>) => Promise<ResourceInventory>;
  containers: (
    labels: Readonly<Record<string, string>>,
  ) => Promise<ResourceInventory["containers"]>;
};
