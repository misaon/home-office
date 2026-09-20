import type {
  SandboxHandle,
  SandboxProvider,
  SandboxRunResult,
  SandboxSpec,
  SandboxState,
} from "@ho/core";
import { errorMessage } from "@ho/protocol";
import {
  createContainer,
  createDockerApi,
  demux,
  type DockerApi,
  hostLimits,
  inspectContainer,
  removeContainer,
  startContainer,
  stopContainer,
  Version,
  volumeMounts,
  Wait,
} from "./api.ts";
import { startEngine } from "./engine.ts";
import { inventory, prune } from "./housekeeping.ts";
import { buildImage, imageHash } from "./image.ts";
import { ensureNetwork } from "./network.ts";

const exposed = (ports: readonly number[]): Record<string, Record<string, never>> =>
  Object.fromEntries(ports.map((port) => [`${String(port)}/tcp`, {}]));

const published = (
  ports: readonly number[],
): Record<string, { HostIp: string; HostPort: string }[]> =>
  Object.fromEntries(
    ports.map((port) => [`${String(port)}/tcp`, [{ HostIp: "127.0.0.1", HostPort: String(port) }]]),
  );

const containerConfig = (spec: SandboxSpec): unknown => ({
  Image: spec.image,
  ExposedPorts: exposed(spec.ports),
  Cmd: [...spec.cmd],
  User: spec.user,
  WorkingDir: spec.workdir,
  Env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
  Labels: { ...spec.labels },
  HostConfig: {
    NetworkMode: spec.network,
    PortBindings: published(spec.ports),
    ExtraHosts: ["host.docker.internal:host-gateway"],
    Binds: spec.binds.map((b) => `${b.source}:${b.target}${b.readonly ? ":ro" : ""}`),
    Mounts: volumeMounts(spec.volumes),
    Tmpfs: { ...spec.tmpfs },
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges"],
    ReadonlyRootfs: spec.readonlyRootfs,
    Init: true,
    ...hostLimits(spec.limits),
  },
});

const logsOf = async (
  api: DockerApi,
  path: string,
): Promise<{ stdout: string; stderr: string }> => {
  const written = await api.raw("GET", `${path}/logs?stdout=1&stderr=1`).catch(() => null);
  return written === null
    ? { stdout: "", stderr: "" }
    : demux(new Uint8Array(await written.arrayBuffer()));
};

async function waitForExit(
  api: DockerApi,
  id: string,
  timeoutMs: number,
): Promise<SandboxRunResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const path = `/containers/${encodeURIComponent(id)}`;
  try {
    const waited = await api.raw("POST", `${path}/wait`, undefined, controller.signal);
    const { StatusCode } = Wait.parse(await waited.json());
    return { exitCode: StatusCode, timedOut: false, ...(await logsOf(api, path)) };
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
    return { exitCode: null, timedOut: true, ...(await logsOf(api, path)) };
  } finally {
    clearTimeout(timer);
  }
}

async function runToCompletion(
  api: DockerApi,
  spec: SandboxSpec,
  timeoutMs: number,
): Promise<SandboxRunResult> {
  const id = await createContainer(api, spec.name, containerConfig(spec));
  try {
    await startContainer(api, id);
    return await waitForExit(api, id, timeoutMs);
  } finally {
    await removeContainer(api, id);
  }
}

export function createDockerProvider(options: {
  socket: string;
  platform?: string;
}): SandboxProvider {
  const api = createDockerApi(options.socket);
  return {
    id: "docker",
    health: async () => {
      try {
        const v = await api.json(Version, "GET", "/version");
        return { ok: true, version: v.Version, apiVersion: v.ApiVersion, os: v.Os, arch: v.Arch };
      } catch (error) {
        return {
          ok: false,
          message: `cannot reach the Docker engine at ${options.socket}\n${errorMessage(error)}`,
        };
      }
    },
    imageHash: (ref) => imageHash(api, ref),
    ensureImage: async (spec, onLine, signal) => {
      if ((await imageHash(api, spec.ref)) !== spec.contentHash) {
        await buildImage(
          spec,
          options.platform,
          options.socket,
          onLine ?? (() => undefined),
          signal,
        );
      }
    },
    ensureNetwork: (name, labels) => ensureNetwork(api, name, labels),
    createVolume: async (name, labels, driverOpts) => {
      await api.raw("POST", "/volumes/create", {
        Name: name,
        Labels: { ...labels },
        ...(driverOpts === undefined ? {} : { Driver: "local", DriverOpts: { ...driverOpts } }),
      });
    },
    removeVolume: async (name) => {
      await api.maybe("DELETE", `/volumes/${encodeURIComponent(name)}?force=1`);
    },
    start: async (spec) => {
      const id = await createContainer(api, spec.name, containerConfig(spec));
      try {
        await startContainer(api, id);
      } catch (error) {
        await removeContainer(api, id);
        throw error;
      }
      return { id, name: spec.name };
    },
    startEngine: (spec, readyTimeoutMs) => startEngine(api, spec, readyTimeoutMs),
    stop: (handle: SandboxHandle, graceSeconds = 5) => stopContainer(api, handle.id, graceSeconds),
    remove: (handle) => removeContainer(api, handle.id),
    inspect: async (handle): Promise<SandboxState> => {
      const { State } = await inspectContainer(api, handle.id);
      return {
        running: State.Running,
        exitCode: State.ExitCode,
        oomKilled: State.OOMKilled,
        error: State.Error,
      };
    },
    run: (spec, timeoutMs = 120_000) => runToCompletion(api, spec, timeoutMs),
    wait: (handle, timeoutMs) => waitForExit(api, handle.id, timeoutMs),
    prune: (scope) => prune(api, scope),
    inventory: (labels) => inventory(api, labels),
  };
}
