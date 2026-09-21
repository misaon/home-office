import type { SandboxSpec, VolumeMount } from "@ho/core";
import { z } from "zod";

const API = "v1.44";
const CPU_NANOS = 1_000_000_000;

type Method = "GET" | "POST" | "DELETE";

export class DockerApiError extends Error {
  readonly status: number;

  constructor(method: Method, path: string, status: number, body: string) {
    super(`docker ${method} ${path} -> ${String(status)}: ${body.trim()}`);
    this.name = "DockerApiError";
    this.status = status;
  }
}

export type DockerApi = {
  raw: (method: Method, path: string, body?: unknown, signal?: AbortSignal) => Promise<Response>;
  json: <T>(schema: z.ZodType<T>, method: Method, path: string, body?: unknown) => Promise<T>;
  maybe: (method: Method, path: string, body?: unknown) => Promise<Response | null>;
};

export function createDockerApi(socket: string): DockerApi {
  const raw = async (
    method: Method,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const init: BunFetchRequestInit = {
      method,
      unix: socket,
      headers: { "content-type": "application/json" },
      signal: signal ?? AbortSignal.timeout(30_000),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`http://docker/${API}${path}`, init);
    if (!res.ok) {
      throw new DockerApiError(method, path, res.status, await res.text());
    }
    return res;
  };
  return {
    raw,
    json: async (schema, method, path, body) => {
      const response = await raw(method, path, body);
      return schema.parse(await response.json());
    },
    maybe: async (method, path, body) => {
      try {
        return await raw(method, path, body);
      } catch (error) {
        if (error instanceof DockerApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  };
}

export const Version = z.object({
  Version: z.string(),
  ApiVersion: z.string(),
  Os: z.string(),
  Arch: z.string(),
});
export const Created = z.object({ Id: z.string() });
export const Wait = z.object({ StatusCode: z.int() });
export const ContainerInspect = z.object({
  State: z.object({
    Running: z.boolean(),
    ExitCode: z.int(),
    OOMKilled: z.boolean(),
    Error: z.string(),
    Health: z.object({ Status: z.string() }).nullish(),
  }),
});
export type ContainerInspect = z.infer<typeof ContainerInspect>;
const ContainerSummary = z.object({
  Id: z.string(),
  Names: z.array(z.string()),
  State: z.string(),
  Created: z.int(),
  Labels: z.record(z.string(), z.string()).nullable(),
});
export type ContainerSummary = z.infer<typeof ContainerSummary>;
export const ContainerList = z.array(ContainerSummary);
const VolumeSummary = z.object({
  Name: z.string(),
  CreatedAt: z.string().optional(),
  Labels: z.record(z.string(), z.string()).nullable(),
});
export const VolumeList = z.object({ Volumes: z.array(VolumeSummary).nullable() });
export const NetworkInspect = z.object({
  Id: z.string(),
  Name: z.string(),
  Driver: z.string(),
  Options: z.record(z.string(), z.string()).nullish(),
  Labels: z.record(z.string(), z.string()).nullish(),
});
export type NetworkInspect = z.infer<typeof NetworkInspect>;
export const ImageList = z.array(
  z.object({
    Id: z.string(),
    RepoTags: z.array(z.string()).nullable(),
    Created: z.int(),
    Size: z.int(),
    Labels: z.record(z.string(), z.string()).nullable(),
  }),
);
export const ImageInspect = z.object({
  Id: z.string().optional(),
  Config: z.object({ Labels: z.record(z.string(), z.string()).nullish() }).nullish(),
});
export const SystemDf = z.object({
  Images: z
    .array(z.object({ Size: z.int(), Labels: z.record(z.string(), z.string()).nullable() }))
    .nullable(),
  Volumes: z
    .array(
      z.object({
        Name: z.string(),
        Labels: z.record(z.string(), z.string()).nullable(),
        UsageData: z.object({ Size: z.int() }).nullable(),
      }),
    )
    .nullable(),
});

export const labelFilter = (
  labels: Readonly<Record<string, string>>,
  extra: Record<string, string[]> = {},
): string =>
  encodeURIComponent(
    JSON.stringify({ label: Object.entries(labels).map(([k, v]) => `${k}=${v}`), ...extra }),
  );

export const nameOf = (summary: ContainerSummary): string =>
  (summary.Names[0] ?? summary.Id).replace(/^\//u, "");

export function demux(buffer: Uint8Array): { stdout: string; stderr: string } {
  const decoder = new TextDecoder();
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  let stdout = "";
  let stderr = "";
  while (offset + 8 <= buffer.byteLength) {
    const streamType = buffer[offset];
    const size = view.getUint32(offset + 4);
    const chunk = decoder.decode(buffer.subarray(offset + 8, offset + 8 + size));
    if (streamType === 2) {
      stderr += chunk;
    } else {
      stdout += chunk;
    }
    offset += 8 + size;
  }
  return { stdout, stderr };
}

export const hostLimits = (
  limits: SandboxSpec["limits"],
): {
  Memory: number;
  MemorySwap: number;
  NanoCpus: number;
  PidsLimit: number;
  LogConfig: { Type: string; Config: Record<string, string> };
} => ({
  Memory: limits.memoryBytes,
  MemorySwap: limits.memoryBytes,
  NanoCpus: Math.round(limits.cpus * CPU_NANOS),
  PidsLimit: limits.pids,
  LogConfig: { Type: "local", Config: { "max-size": "10m", "max-file": "2" } },
});

export const volumeMounts = (
  volumes: readonly VolumeMount[],
): { Type: string; Source: string; Target: string; ReadOnly: boolean }[] =>
  volumes.map((v) => ({
    Type: "volume",
    Source: v.name,
    Target: v.target,
    ReadOnly: v.readonly === true,
  }));

const container = (id: string): string => `/containers/${encodeURIComponent(id)}`;

export const createContainer = async (
  api: DockerApi,
  name: string,
  config: unknown,
): Promise<string> => {
  const created = await api.json(
    Created,
    "POST",
    `/containers/create?name=${encodeURIComponent(name)}`,
    config,
  );
  return created.Id;
};

export const startContainer = async (api: DockerApi, id: string): Promise<void> => {
  await api.raw("POST", `${container(id)}/start`);
};

export async function stopContainer(
  api: DockerApi,
  id: string,
  graceSeconds: number,
): Promise<void> {
  try {
    await api.raw("POST", `${container(id)}/stop?t=${String(graceSeconds)}`);
  } catch (error) {
    if (!(error instanceof DockerApiError && (error.status === 304 || error.status === 404))) {
      throw error;
    }
  }
}

export async function removeContainer(api: DockerApi, id: string): Promise<void> {
  await api.maybe("DELETE", `${container(id)}?v=1&force=1`);
}

export const inspectContainer = (api: DockerApi, id: string): Promise<ContainerInspect> =>
  api.json(ContainerInspect, "GET", `${container(id)}/json`);
