import type { SandboxProvider, SandboxSpec } from "@ho/core";
import type { Project } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import { elapsedMs } from "./timing.ts";

const OUTPUT_MAX = 6000;

export type VerifyResult = { ok: boolean; exitCode: number | null; output: string; ms: number };

const tail = (result: { stdout: string; stderr: string }): string => {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  return text.length <= OUTPUT_MAX ? text : `…\n${text.slice(-OUTPUT_MAX)}`;
};

export async function runVerify(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
): Promise<VerifyResult> {
  const { command, timeoutSeconds } = project.verify;
  const spec: SandboxSpec = {
    name: `${volume}-verify`,
    image: config.docker.agentImage,
    cmd: ["/bin/sh", "-lc", command],
    env: { CI: "1", HOME: "/home/agent" },
    user: "1000:1000",
    workdir: REPO_IN_VOLUME,
    labels: { [LABELS.managed]: "true", [LABELS.kind]: "verify" },
    network: "none",
    volumes: [{ name: volume, target: "/work" }],
    binds: [],
    tmpfs: { "/tmp": "rw,nosuid,size=256m", "/home/agent": "rw,nosuid,size=256m" },
    limits: { memoryBytes: 3 * 1024 * 1024 * 1024, cpus: 2, pids: 1024 },
    readonlyRootfs: false,
    ports: [],
  };
  const started = Bun.nanoseconds();
  const result = await provider.run(spec, timeoutSeconds * 1000);
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    output: tail(result),
    ms: elapsedMs(started),
  };
}
