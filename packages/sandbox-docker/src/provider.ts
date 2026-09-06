import type {
  SandboxHandle,
  SandboxProvider,
  SandboxRunResult,
  SandboxSpec,
  VolumeRef,
} from "@ho/core";
import {
  Created,
  type DockerApi,
  DockerApiError,
  NetworkList,
  Version,
  Wait,
  createDockerApi,
  demux,
} from "./api.ts";
import { prune, removeContainer, snapshot } from "./housekeeping.ts";
import { buildImage, imageHash } from "./image.ts";

const CPU_NANOS = 1_000_000_000;

export type DockerProviderOptions = { socket?: string; platform?: string };

const containerConfig = (spec: SandboxSpec) => ({
  Image: spec.image,
  Cmd: [...spec.cmd],
  User: spec.user,
  WorkingDir: spec.workdir,
  Env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
  Labels: { ...spec.labels },
  HostConfig: {
    NetworkMode: spec.network,
    ExtraHosts: ["host.docker.internal:host-gateway"],
    Binds: spec.binds.map((b) => `${b.source}:${b.target}${b.readonly ? ":ro" : ""}`),
    Mounts: spec.volumes.map((v) => ({
      Type: "volume",
      Source: v.name,
      Target: v.target,
      ReadOnly: v.readonly === true,
    })),
    Tmpfs: { ...spec.tmpfs },
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges"],
    ReadonlyRootfs: spec.readonlyRootfs,
    Memory: spec.limits.memoryBytes,
    NanoCpus: Math.round(spec.limits.cpus * CPU_NANOS),
    PidsLimit: spec.limits.pids,
    Init: true,
  },
});

const createContainer = async (api: DockerApi, spec: SandboxSpec): Promise<string> =>
  (
    await api.json(
      Created,
      "POST",
      `/containers/create?name=${encodeURIComponent(spec.name)}`,
      containerConfig(spec),
    )
  ).Id;

async function runToCompletion(
  api: DockerApi,
  spec: SandboxSpec,
  timeoutMs: number,
): Promise<SandboxRunResult> {
  const started = performance.now();
  const id = await createContainer(api, spec);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await api.raw("POST", `/containers/${id}/start`);
    const { StatusCode } = Wait.parse(
      await (await api.raw("POST", `/containers/${id}/wait`, undefined, controller.signal)).json(),
    );
    const logs = demux(
      new Uint8Array(
        await (await api.raw("GET", `/containers/${id}/logs?stdout=1&stderr=1`)).arrayBuffer(),
      ),
    );
    return { exitCode: StatusCode, ...logs, durationMs: performance.now() - started };
  } finally {
    clearTimeout(timer);
    await removeContainer(api, id);
  }
}

export function createDockerProvider(options: DockerProviderOptions = {}): SandboxProvider {
  const api = createDockerApi(options.socket);
  return {
    id: "docker",
    health: async () => {
      try {
        const v = await api.json(Version, "GET", "/version");
        return { ok: true, version: v.Version, apiVersion: v.ApiVersion, os: v.Os, arch: v.Arch };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    ensureImage: async (spec, onProgress) => {
      if ((await imageHash(api, spec.ref)) !== spec.contentHash) {
        await buildImage(spec, options.platform, onProgress);
      }
    },
    ensureNetwork: async (name, labels) => {
      const filter = encodeURIComponent(JSON.stringify({ name: [name] }));
      const existing = await api.json(NetworkList, "GET", `/networks?filters=${filter}`);
      if (!existing.some((n) => n.Name === name)) {
        await api.json(Created, "POST", "/networks/create", {
          Name: name,
          Driver: "bridge",
          Options: { "com.docker.network.bridge.enable_icc": "false" },
          Labels: { ...labels },
        });
      }
    },
    createVolume: async (name, labels) => {
      await api.raw("POST", "/volumes/create", { Name: name, Labels: { ...labels } });
      return { name };
    },
    removeVolume: async (ref: VolumeRef) => {
      await api.maybe("DELETE", `/volumes/${ref.name}?force=1`);
    },
    start: async (spec) => {
      const id = await createContainer(api, spec);
      try {
        await api.raw("POST", `/containers/${id}/start`);
      } catch (error) {
        await removeContainer(api, id);
        throw error;
      }
      return { id, name: spec.name };
    },
    stop: async (handle, graceSeconds = 5) => {
      try {
        await api.raw("POST", `/containers/${handle.id}/stop?t=${String(graceSeconds)}`);
      } catch (error) {
        // 304: already stopped; 404: already gone.
        if (!(error instanceof DockerApiError && (error.status === 304 || error.status === 404))) {
          throw error;
        }
      }
    },
    remove: async (handle: SandboxHandle) => {
      await removeContainer(api, handle.id);
    },
    run: (spec, timeoutMs = 120_000) => runToCompletion(api, spec, timeoutMs),
    logs: async (handle, tail = 200) => {
      const res = await api.raw(
        "GET",
        `/containers/${handle.id}/logs?stdout=1&stderr=1&tail=${String(tail)}`,
      );
      return demux(new Uint8Array(await res.arrayBuffer()));
    },
    prune: (scope) => prune(api, scope),
    snapshot: (labels) => snapshot(api, labels),
  };
}
