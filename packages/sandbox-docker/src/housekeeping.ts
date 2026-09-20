import type { PruneReport, PruneScope } from "@ho/core";
import type { ResourceInventory } from "@ho/protocol";
import {
  ContainerList,
  type ContainerSummary,
  type DockerApi,
  DockerApiError,
  ImageList,
  labelFilter,
  nameOf,
  removeContainer,
  SystemDf,
  VolumeList,
} from "./api.ts";

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

export async function prune(api: DockerApi, scope: PruneScope): Promise<PruneReport> {
  const report: PruneReport = { containers: [], volumes: [], images: [] };
  const cutoff =
    scope.olderThanMs === undefined ? Number.POSITIVE_INFINITY : Date.now() - scope.olderThanMs;
  const kept = (name: string): boolean => scope.keep?.(name) === true;
  if (scope.kinds.includes("containers")) {
    const containers = await api.json(
      ContainerList,
      "GET",
      `/containers/json?all=1&filters=${labelFilter(scope.labels)}`,
    );
    for (const c of containers) {
      if (
        c.State !== "running" &&
        c.State !== "created" &&
        c.Created * 1000 <= cutoff &&
        !kept(nameOf(c))
      ) {
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
    for (const v of listed.Volumes ?? []) {
      const createdAt = v.CreatedAt === undefined ? 0 : new Date(v.CreatedAt).getTime();
      if (createdAt <= cutoff && !kept(v.Name) && (await removeVolumeIfFree(api, v.Name))) {
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

const describeContainers = (
  containers: readonly ContainerSummary[],
): ResourceInventory["containers"] =>
  containers.map((c) => ({
    name: nameOf(c),
    state: c.State,
    kind: c.Labels?.["ho.kind"] ?? "unknown",
    sessionId: c.Labels?.["ho.session"] ?? null,
    createdAt: iso(c.Created),
  }));

export const containers = async (
  api: DockerApi,
  labels: Readonly<Record<string, string>>,
): Promise<ResourceInventory["containers"]> =>
  describeContainers(
    await api.json(ContainerList, "GET", `/containers/json?all=1&filters=${labelFilter(labels)}`),
  );

export async function inventory(
  api: DockerApi,
  labels: Readonly<Record<string, string>>,
): Promise<ResourceInventory> {
  const [listed, volumes, df] = await Promise.all([
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
      containers: listed.length,
      volumes: owned.length,
      imagesBytes: (df.Images ?? [])
        .filter((i) => has(i.Labels))
        .reduce((sum, i) => sum + i.Size, 0),
      volumesBytes: owned.reduce((sum, v) => sum + (v.UsageData?.Size ?? 0), 0),
    },
    containers: describeContainers(listed),
    volumes: (volumes.Volumes ?? []).map((v) => ({
      name: v.Name,
      kind: v.Labels?.["ho.kind"] ?? "unknown",
      sessionId: v.Labels?.["ho.session"] ?? null,
      createdAt: isoOrNull(v.CreatedAt),
      sizeBytes: sizes.get(v.Name) ?? null,
    })),
  };
}
