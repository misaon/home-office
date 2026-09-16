import type {
  PruneReport,
  PruneScope,
  SandboxHandle,
  SandboxProvider,
  SandboxRunResult,
  SandboxSpec,
} from "@ho/core";
import { errorMessage, type ResourceInventory } from "@ho/protocol";
import {
  ContainerList,
  createContainer,
  createDockerApi,
  Created,
  demux,
  type DockerApi,
  DockerApiError,
  hostLimits,
  ImageList,
  labelFilter,
  nameOf,
  NetworkList,
  removeContainer,
  startContainer,
  stopContainer,
  SystemDf,
  Version,
  volumeMounts,
  VolumeList,
  Wait,
} from "./api.ts";
import { startEngine } from "./engine.ts";
import { buildImage, imageHash } from "./image.ts";

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

async function runToCompletion(
  api: DockerApi,
  spec: SandboxSpec,
  timeoutMs: number,
): Promise<SandboxRunResult> {
  const id = await createContainer(api, spec.name, containerConfig(spec));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await startContainer(api, id);
    const path = `/containers/${encodeURIComponent(id)}`;
    const waited = await api.raw("POST", `${path}/wait`, undefined, controller.signal);
    const { StatusCode } = Wait.parse(await waited.json());
    const written = await api.raw("GET", `${path}/logs?stdout=1&stderr=1`);
    const logs = demux(new Uint8Array(await written.arrayBuffer()));
    return { exitCode: StatusCode, ...logs };
  } finally {
    clearTimeout(timer);
    await removeContainer(api, id);
  }
}

const removeVolumeIfFree = async (api: DockerApi, name: string): Promise<boolean> => {
  try {
    await api.raw("DELETE", `/volumes/${encodeURIComponent(name)}`);
    return true;
  } catch (error) {
    if (error instanceof DockerApiError && (error.status === 404 || error.status === 409)) {
      return false;
    }
    throw error;
  }
};

async function prune(api: DockerApi, scope: PruneScope): Promise<PruneReport> {
  const report: PruneReport = { containers: [], volumes: [], images: [] };
  const cutoff =
    scope.olderThanMs === undefined ? Number.POSITIVE_INFINITY : Date.now() - scope.olderThanMs;
  if (scope.kinds.includes("containers")) {
    const containers = await api.json(
      ContainerList,
      "GET",
      `/containers/json?all=1&filters=${labelFilter(scope.labels)}`,
    );
    for (const c of containers) {
      if (c.State !== "running" && c.State !== "created" && c.Created * 1000 <= cutoff) {
        await removeContainer(api, c.Id);
        report.containers.push(nameOf(c));
      }
    }
  }
  if (scope.kinds.includes("volumes")) {
    const listed = await api.json(
      VolumeList,
      "GET",
      `/volumes?filters=${labelFilter(scope.labels)}`,
    );
    const volumes = listed.Volumes ?? [];
    for (const v of volumes) {
      const createdAt = v.CreatedAt === undefined ? 0 : new Date(v.CreatedAt).getTime();
      if (createdAt <= cutoff && (await removeVolumeIfFree(api, v.Name))) {
        report.volumes.push(v.Name);
      }
    }
  }
  if (scope.kinds.includes("images")) {
    const images = await api.json(
      ImageList,
      "GET",
      `/images/json?filters=${labelFilter(scope.labels, { dangling: ["true"] })}`,
    );
    for (const image of images) {
      if (image.Created * 1000 <= cutoff) {
        await api.maybe("DELETE", `/images/${image.Id}`);
        report.images.push(image.Id);
      }
    }
  }
  return report;
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();
const isoOrNull = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

async function inventory(
  api: DockerApi,
  labels: Readonly<Record<string, string>>,
): Promise<ResourceInventory> {
  const [containers, volumes, df] = await Promise.all([
    api.json(ContainerList, "GET", `/containers/json?all=1&filters=${labelFilter(labels)}`),
    api.json(VolumeList, "GET", `/volumes?filters=${labelFilter(labels)}`),
    api.json(SystemDf, "GET", "/system/df"),
  ]);
  const has = (candidate: Record<string, string> | null): boolean =>
    Object.entries(labels).every(([k, v]) => candidate?.[k] === v);
  const owned = (df.Volumes ?? []).filter((v) => has(v.Labels));
  const sizes = new Map(owned.map((v) => [v.Name, v.UsageData?.Size ?? null] as const));
  return {
    snapshot: {
      containers: containers.length,
      volumes: owned.length,
      imagesBytes: (df.Images ?? [])
        .filter((i) => has(i.Labels))
        .reduce((sum, i) => sum + i.Size, 0),
      volumesBytes: owned.reduce((sum, v) => sum + (v.UsageData?.Size ?? 0), 0),
    },
    containers: containers.map((c) => ({
      name: nameOf(c),
      state: c.State,
      kind: c.Labels?.["ho.kind"] ?? "unknown",
      sessionId: c.Labels?.["ho.session"] ?? null,
      createdAt: iso(c.Created),
    })),
    volumes: (volumes.Volumes ?? []).map((v) => ({
      name: v.Name,
      kind: v.Labels?.["ho.kind"] ?? "unknown",
      sessionId: v.Labels?.["ho.session"] ?? null,
      createdAt: isoOrNull(v.CreatedAt),
      sizeBytes: sizes.get(v.Name) ?? null,
    })),
  };
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
    run: (spec, timeoutMs = 120_000) => runToCompletion(api, spec, timeoutMs),
    prune: (scope) => prune(api, scope),
    inventory: (labels) => inventory(api, labels),
  };
}
