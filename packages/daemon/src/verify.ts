import type { SandboxProvider, SandboxSpec } from "@ho/core";
import type { Project } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";

/** How much of a failing run travels back to the agent; the tail is where the failure usually is. */
const OUTPUT_MAX = 6000;

/** The last `OUTPUT_MAX` characters of what the command said, marked when anything was dropped. */
const tail = (result: { stdout: string; stderr: string }): string => {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  return text.length <= OUTPUT_MAX ? text : `…\n${text.slice(-OUTPUT_MAX)}`;
};

/**
 * Runs the floor's own checks against the task's working tree, in a throwaway container built from the
 * agent image with only the task volume attached and no network.
 *
 * The command is repository-supplied and runs through a shell, which is safe for exactly one reason:
 * it runs *inside the sandbox*, where the repository's own code and its own agent already run. It must
 * never gain a path to the host — that is the invariant this module exists to hold.
 */
export async function runVerify(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
): Promise<{ ok: boolean; output: string }> {
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
  };
  const result = await provider.run(spec, timeoutSeconds * 1000);
  return { ok: result.exitCode === 0, output: tail(result) };
}
