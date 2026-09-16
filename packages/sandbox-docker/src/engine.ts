// The private per-task container engine: a dind sibling that joins the sandbox's network namespace.
import type { EngineMode, EngineSpec, SandboxHandle } from "@ho/core";
import { errorMessage } from "@ho/protocol";
import {
  createContainer,
  type DockerApi,
  hostLimits,
  inspectContainer,
  removeContainer,
  startContainer,
  stopContainer,
  volumeMounts,
} from "./api.ts";

const MS_NANOS = 1_000_000;
const POLL_MS = 200;
/** Fast health probes while the daemon waits, then one every half minute as a liveness signal. */
const START_INTERVAL_MS = 250;
const STEADY_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_RETRIES = 3;
/** Its own budget: the engine image is ~549 MB, and the readiness timeout is about booting, not pulling. */
const PULL_TIMEOUT_MS = 15 * 60_000;

/** Where each mode keeps its image and container store; the task's cache volume is mounted there. */
const DATA_ROOT: Record<EngineMode, string> = {
  rootless: "/home/rootless/.local/share/docker",
  rootful: "/var/lib/docker",
};

const socketPath = (spec: EngineSpec): string => `${spec.socketDir}/docker.sock`;

/**
 * Rootful dockerd owns its socket as root, so the group is set to the sandbox user's gid; the rootless
 * daemon already runs as that user. The dind entrypoint appends its own listeners to these arguments.
 */
const dockerdArgs = (spec: EngineSpec): string[] =>
  spec.mode === "rootful"
    ? [`--host=unix://${socketPath(spec)}`, "--group=1000"]
    : [`--host=unix://${socketPath(spec)}`];

const engineConfig = (spec: EngineSpec, readyTimeoutMs: number): unknown => ({
  Image: spec.image,
  Cmd: dockerdArgs(spec),
  Labels: { ...spec.labels },
  Healthcheck: {
    Test: ["CMD-SHELL", `docker -H unix://${socketPath(spec)} version >/dev/null 2>&1`],
    Interval: STEADY_INTERVAL_MS * MS_NANOS,
    StartInterval: START_INTERVAL_MS * MS_NANOS,
    StartPeriod: readyTimeoutMs * MS_NANOS,
    Timeout: PROBE_TIMEOUT_MS * MS_NANOS,
    Retries: PROBE_RETRIES,
  },
  HostConfig: {
    // Published ports of the repository's services land on the sandbox's own loopback.
    NetworkMode: `container:${spec.attachTo.id}`,
    Privileged: true,
    Mounts: volumeMounts([
      ...spec.volumes,
      { name: spec.cacheVolume, target: DATA_ROOT[spec.mode] },
    ]),
    ...hostLimits(spec.limits),
  },
});

/**
 * Image inspection rejects a `name:tag@digest` reference with 404 even when the image is present
 * (measured against Engine 29.7.2, API v1.44), so presence is checked by `name@digest` while the pull
 * keeps the readable reference. An engine image already on the machine means no registry call at all.
 */
const presenceRef = (ref: string): string => {
  const at = ref.indexOf("@");
  const colon = ref.lastIndexOf(":", at === -1 ? ref.length : at);
  return at === -1 || colon === -1 ? ref : `${ref.slice(0, colon)}${ref.slice(at)}`;
};

const ensureImage = async (api: DockerApi, ref: string, timeoutMs: number): Promise<void> => {
  const found = await api.maybe("GET", `/images/${encodeURIComponent(presenceRef(ref))}/json`);
  if (found !== null) {
    return;
  }
  const response = await api
    .raw(
      "POST",
      `/images/create?fromImage=${encodeURIComponent(ref)}`,
      undefined,
      AbortSignal.timeout(timeoutMs),
    )
    .catch((error: unknown) => {
      throw new Error(`pulling ${ref} failed: ${errorMessage(error)}`);
    });
  // The pull is a progress stream that answers 200 first and reports failure inside its own body.
  const body = await response.text();
  if (body.includes(`"errorDetail"`)) {
    throw new Error(`pulling ${ref} failed: ${body.trimEnd().split("\n").at(-1) ?? ""}`);
  }
};

/** Resolves on the first successful health probe; a container that exits first fails immediately. */
async function waitReady(api: DockerApi, handle: SandboxHandle, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const inspected = await inspectContainer(api, handle.id);
    const state = inspected.State;
    if (state.Health?.Status === "healthy") {
      return;
    }
    if (!state.Running) {
      throw new Error(
        `task engine ${handle.name} exited with code ${String(state.ExitCode)}${
          state.OOMKilled ? " (out of memory)" : ""
        }${state.Error === "" ? "" : `: ${state.Error}`}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `task engine ${handle.name} did not become ready within ${String(timeoutMs)}ms`,
      );
    }
    await Bun.sleep(POLL_MS);
  }
}

export async function startEngine(
  api: DockerApi,
  spec: EngineSpec,
  readyTimeoutMs: number,
): Promise<SandboxHandle> {
  await ensureImage(api, spec.image, PULL_TIMEOUT_MS);
  const id = await createContainer(api, spec.name, engineConfig(spec, readyTimeoutMs));
  const handle: SandboxHandle = { id, name: spec.name };
  try {
    await startContainer(api, id);
    await waitReady(api, handle, readyTimeoutMs);
    return handle;
  } catch (error) {
    await stopContainer(api, id, 2).catch(() => null);
    await removeContainer(api, id).catch(() => null);
    throw error;
  }
}
