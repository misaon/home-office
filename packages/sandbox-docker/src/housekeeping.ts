import type { PruneReport, PruneScope, ResourceInventory, ResourceSnapshot } from "@ho/core";
import {
  ContainerList,
  type DockerApi,
  DockerApiError,
  ImageList,
  SystemDf,
  VolumeList,
  labelFilter,
} from "./api.ts";

export async function removeContainer(api: DockerApi, id: string): Promise<void> {
  await api.maybe("DELETE", `/containers/${id}?v=1&force=1`);
}

const removeVolumeIfFree = async (api: DockerApi, name: string): Promise<boolean> => {
  try {
    await api.raw("DELETE", `/volumes/${name}`);
    return true;
  } catch (error) {
    // 404: already gone; 409: still in use by a container, leave it for the next sweep.
    if (error instanceof DockerApiError && (error.status === 404 || error.status === 409)) {
      return false;
    }
    throw error;
  }
};

export async function prune(api: DockerApi, scope: PruneScope): Promise<PruneReport> {
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
      if (c.State !== "running" && c.Created * 1000 <= cutoff) {
        await removeContainer(api, c.Id);
        report.containers.push(c.Names[0] ?? c.Id);
      }
    }
  }
  if (scope.kinds.includes("volumes")) {
    const volumes =
      (await api.json(VolumeList, "GET", `/volumes?filters=${labelFilter(scope.labels)}`))
        .Volumes ?? [];
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

export async function snapshot(
  api: DockerApi,
  labels: Readonly<Record<string, string>>,
): Promise<ResourceSnapshot> {
  const has = (candidate: Record<string, string> | null): boolean =>
    Object.entries(labels).every(([k, v]) => candidate?.[k] === v);
  const [containers, df] = await Promise.all([
    api.json(ContainerList, "GET", `/containers/json?all=1&filters=${labelFilter(labels)}`),
    api.json(SystemDf, "GET", "/system/df"),
  ]);
  const volumes = (df.Volumes ?? []).filter((v) => has(v.Labels));
  return {
    containers: containers.length,
    volumes: volumes.length,
    imagesBytes: (df.Images ?? []).filter((i) => has(i.Labels)).reduce((sum, i) => sum + i.Size, 0),
    volumesBytes: volumes.reduce((sum, v) => sum + (v.UsageData?.Size ?? 0), 0),
  };
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();
const isoOrNull = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

export async function inventory(
  api: DockerApi,
  labels: Readonly<Record<string, string>>,
): Promise<ResourceInventory> {
  const [containers, volumes, df, snap] = await Promise.all([
    api.json(ContainerList, "GET", `/containers/json?all=1&filters=${labelFilter(labels)}`),
    api.json(VolumeList, "GET", `/volumes?filters=${labelFilter(labels)}`),
    api.json(SystemDf, "GET", "/system/df"),
    snapshot(api, labels),
  ]);
  const sizes = new Map(
    (df.Volumes ?? []).map((v) => [v.Name, v.UsageData?.Size ?? null] as const),
  );
  return {
    snapshot: snap,
    containers: containers.map((c) => ({
      name: (c.Names[0] ?? c.Id).replace(/^\//u, ""),
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
