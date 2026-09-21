import type { Cancellation, ImageSpec } from "@ho/core";
import { type DockerApi, ImageInspect } from "./api.ts";

const HASH_LABEL = "ho.content-hash";
const BUILD_TIMEOUT_MS = 30 * 60_000;

export async function imageHash(api: DockerApi, ref: string): Promise<string | null> {
  const res = await api.maybe("GET", `/images/${encodeURIComponent(ref)}/json`);
  if (res === null) {
    return null;
  }
  return ImageInspect.parse(await res.json()).Config?.Labels?.[HASH_LABEL] ?? "";
}

export async function imageId(api: DockerApi, ref: string): Promise<string | null> {
  const res = await api.maybe("GET", `/images/${encodeURIComponent(ref)}/json`);
  if (res === null) {
    return null;
  }
  return ImageInspect.parse(await res.json()).Id ?? null;
}

async function pump(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let all = "";
  let rest = "";
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    all = (all + text).slice(-4000);
    rest += text;
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim() !== "") {
        onLine(line);
      }
    }
  }
  rest += decoder.decode();
  if (rest.trim() !== "") {
    onLine(rest);
  }
  return all;
}

export async function buildImage(
  spec: ImageSpec,
  platform: string | undefined,
  socket: string,
  onLine: (line: string) => void,
  signal?: Cancellation,
): Promise<void> {
  const args = [
    "docker",
    "--host",
    `unix://${socket}`,
    "buildx",
    "build",
    "--builder",
    "default",
    "--load",
    "-t",
    spec.ref,
    "--label",
    `${HASH_LABEL}=${spec.contentHash}`,
  ];
  for (const [k, v] of Object.entries(spec.labels)) {
    args.push("--label", `${k}=${v}`);
  }
  if (platform !== undefined) {
    args.push("--platform", platform);
  }
  if (spec.target !== undefined) {
    args.push("--target", spec.target);
  }
  args.push(spec.contextDir);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", timeout: BUILD_TIMEOUT_MS });
  const cancel = (): void => {
    proc.kill();
  };
  signal?.addEventListener("abort", cancel);
  if (signal?.aborted === true) {
    cancel();
  }
  const [, stderr, code] = await Promise.all([
    pump(proc.stdout, onLine),
    pump(proc.stderr, onLine),
    proc.exited,
  ]).finally(() => {
    signal?.removeEventListener("abort", cancel);
  });
  if (code !== 0) {
    throw new Error(`image build failed (${String(code)}): ${stderr.slice(-2000)}`);
  }
}
