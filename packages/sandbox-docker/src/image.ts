import type { BuildProgress, ImageSpec } from "@ho/core";
import { z } from "zod";
import type { DockerApi } from "./api.ts";

const HASH_LABEL = "ho.content-hash";

const ImageInspect = z.object({
  Config: z.object({ Labels: z.record(z.string(), z.string()).nullish() }).nullish(),
});

export async function imageHash(api: DockerApi, ref: string): Promise<string | null> {
  const res = await api.maybe("GET", `/images/${encodeURIComponent(ref)}/json`);
  if (res === null) {
    return null;
  }
  const inspect = ImageInspect.parse(await res.json());
  return inspect.Config?.Labels?.[HASH_LABEL] ?? "";
}

async function pump(
  stream: ReadableStream<Uint8Array>,
  onLine?: (line: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let all = "";
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    all = (all + text).slice(-4000);
    for (const line of text.split("\n")) {
      if (line.trim() !== "") {
        onLine?.(line);
      }
    }
  }
  return all;
}

/** Builds via the docker CLI (buildx handles context tarballs and cache); everything else uses the Engine API. */
export async function buildImage(
  spec: ImageSpec,
  platform: string | undefined,
  socket: string,
  onProgress?: (p: BuildProgress) => void,
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
  if (spec.dockerfile !== undefined) {
    args.push("-f", spec.dockerfile);
  }
  if (spec.target !== undefined) {
    args.push("--target", spec.target);
  }
  args.push(spec.contextDir);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const report = (line: string): void => {
    onProgress?.({ line });
  };
  const [, stderr, code] = await Promise.all([
    pump(proc.stdout, report),
    pump(proc.stderr, report),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`image build failed (${String(code)}): ${stderr.slice(-2000)}`);
  }
}
