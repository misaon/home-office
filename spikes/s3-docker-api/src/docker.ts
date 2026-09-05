// Minimal Docker Engine API client over the unix socket using Bun's fetch({ unix }).
import { z } from "zod";

const SOCKET = "/var/run/docker.sock";
const API = "v1.55";

type Method = "GET" | "POST" | "DELETE";

export async function dockerRaw(method: Method, path: string, body?: unknown): Promise<Response> {
  const init: BunFetchRequestInit = {
    method,
    unix: SOCKET,
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`http://docker/${API}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`docker ${method} ${path} -> ${res.status}: ${text}`);
  }
  return res;
}

export async function dockerJson<T>(
  schema: z.ZodType<T>,
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await dockerRaw(method, path, body);
  return schema.parse(await res.json());
}

export const Version = z.object({
  Version: z.string(),
  ApiVersion: z.string(),
  Os: z.string(),
  Arch: z.string(),
});
export const Created = z.object({ Id: z.string() });
export const VolumeCreated = z.object({ Name: z.string() });
export const ContainerSummary = z.object({
  Id: z.string(),
  Names: z.array(z.string()),
  State: z.string(),
});
export const ContainerList = z.array(ContainerSummary);
export const VolumeList = z.object({ Volumes: z.array(z.object({ Name: z.string() })).nullable() });
export const NetworkList = z.array(z.object({ Id: z.string(), Name: z.string() }));

export async function imageExists(ref: string): Promise<boolean> {
  const res = await fetch(`http://docker/${API}/images/${encodeURIComponent(ref)}/json`, {
    unix: SOCKET,
  });
  return res.ok;
}

export async function pullImage(image: string, tag: string): Promise<void> {
  const res = await dockerRaw(
    "POST",
    `/images/create?fromImage=${encodeURIComponent(image)}&tag=${tag}`,
  );
  // Consume the progress stream until the pull completes.
  await res.text();
}

export function labelFilter(labels: Record<string, string>): string {
  const filter = { label: Object.entries(labels).map(([key, value]) => `${key}=${value}`) };
  return encodeURIComponent(JSON.stringify(filter));
}

/** Docker multiplexed stream (TTY off): 8-byte header per frame. Returns stdout and stderr text. */
export function demux(buffer: Uint8Array): { stdout: string; stderr: string } {
  const decoder = new TextDecoder();
  let offset = 0;
  let stdout = "";
  let stderr = "";
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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
