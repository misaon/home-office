// Thin, typed Docker Engine API client over the unix socket. No SDK: Bun's fetch speaks unix sockets.
import { z } from "zod";

const DEFAULT_SOCKET = "/var/run/docker.sock";
const API = "v1.44";

type Method = "GET" | "POST" | "DELETE";

export class DockerApiError extends Error {
  readonly status: number;
  readonly method: Method;
  readonly path: string;

  constructor(method: Method, path: string, status: number, body: string) {
    super(`docker ${method} ${path} -> ${String(status)}: ${body.trim()}`);
    this.name = "DockerApiError";
    this.status = status;
    this.method = method;
    this.path = path;
  }
}

export type DockerApi = {
  raw: (method: Method, path: string, body?: unknown, signal?: AbortSignal) => Promise<Response>;
  json: <T>(schema: z.ZodType<T>, method: Method, path: string, body?: unknown) => Promise<T>;
  /** Like `raw` but resolves to null on 404 instead of throwing. */
  maybe: (method: Method, path: string, body?: unknown) => Promise<Response | null>;
};

export function createDockerApi(socket = DEFAULT_SOCKET): DockerApi {
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
    json: async (schema, method, path, body) =>
      schema.parse(await (await raw(method, path, body)).json()),
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

// ---- response schemas (only the fields we read) -------------------------------------------------

export const Version = z.object({
  Version: z.string(),
  ApiVersion: z.string(),
  Os: z.string(),
  Arch: z.string(),
});
export const Created = z.object({ Id: z.string() });
export const Wait = z.object({ StatusCode: z.int() });
/** Only what the engine readiness wait reads; `Health` is absent on containers without a healthcheck. */
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
export const ContainerList = z.array(ContainerSummary);
const VolumeSummary = z.object({
  Name: z.string(),
  CreatedAt: z.string().optional(),
  Labels: z.record(z.string(), z.string()).nullable(),
});
export const VolumeList = z.object({ Volumes: z.array(VolumeSummary).nullable() });
const NetworkSummary = z.object({ Id: z.string(), Name: z.string() });
export const NetworkList = z.array(NetworkSummary);
const ImageSummary = z.object({
  Id: z.string(),
  RepoTags: z.array(z.string()).nullable(),
  Created: z.int(),
  Size: z.int(),
  Labels: z.record(z.string(), z.string()).nullable(),
});
export const ImageList = z.array(ImageSummary);
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

/** Docker multiplexed stream (TTY off): 8-byte header per frame — type, padding, big-endian length. */
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
