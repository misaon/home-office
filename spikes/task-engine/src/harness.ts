// The moving parts of the harness: one "task" is a task volume, a hardened sandbox and its engine,
// started and swept the way the daemon does it. The checks themselves live in run.ts.
import { $ } from "bun";
import {
  createIdFactory,
  type SandboxHandle,
  type SandboxProvider,
  type SandboxSpec,
  type TaskEngineProvider,
} from "@ho/core";
import type { DaemonConfig } from "@ho/daemon";
import {
  engineEnv,
  prepareTaskEngine,
  startTaskEngine,
  type TaskEnginePlan,
  type TaskEngineRequest,
} from "@ho/daemon/task-engine";

const ids = createIdFactory(
  { now: () => new Date() },
  {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  },
);

const FIXTURE = `${import.meta.dir}/../fixture`;
export const NETWORK = "ho-spike-net";
export const FALLBACK_IMAGE = "docker:29.8.0-cli";
export const MIB = 1024 * 1024;

const labelsFor = (id: string): Record<string, string> => ({
  "ho.managed": "true",
  "ho.session": `spike-${id}`,
  "ho.project": "spike",
});

export const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
export const step = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  const value = await run();
  out(`[${String(Date.now() - started).padStart(6)} ms] ${what}`);
  return value;
};
export const check = (what: string, ok: boolean, detail: string): boolean => {
  out(`${ok ? "PASS" : "FAIL"}  ${what}${detail === "" ? "" : ` — ${detail}`}`);
  return ok;
};

export type Provider = SandboxProvider & TaskEngineProvider;
export type Task = {
  id: string;
  volume: string;
  plan: TaskEnginePlan;
  sandbox: SandboxHandle;
  engine: SandboxHandle;
};

const sandboxSpec = (
  id: string,
  image: string,
  plan: TaskEnginePlan,
  volume: string,
): SandboxSpec => ({
  name: `ho-session-spike${id}`,
  image,
  cmd: ["sleep", "1800"],
  env: { HOME: "/home/agent", TERM: "dumb", ...engineEnv(plan.mode) },
  user: "1000:1000",
  workdir: "/work/repo",
  labels: { ...labelsFor(id), "ho.kind": "session" },
  network: NETWORK,
  volumes: [
    { name: volume, target: "/work" },
    { name: plan.socketVolume, target: plan.socketDir },
  ],
  binds: [],
  tmpfs: { "/tmp": "rw,nosuid,size=256m", "/home/agent": "rw,nosuid,size=128m,uid=1000,gid=1000" },
  limits: { memoryBytes: 1024 * MIB, cpus: 2, pids: 2048 },
  readonlyRootfs: true,
});

export const requestFor = (id: string, volume: string): TaskEngineRequest => ({
  mode: "rootless",
  sessionId: ids.session(),
  taskVolume: volume,
  labels: labelsFor(id),
});

/** Fills the task volume the way git-bridge fills it for a real session: a repository at /work/repo. */
const seedRepo = async (volume: string): Promise<void> => {
  await $`docker run --rm -v ${volume}:/work -v ${FIXTURE}:/seed:ro alpine:3.24 sh -c ${"mkdir -p /work/repo && cp -R /seed/. /work/repo/ && chown -R 1000:1000 /work"}`.quiet();
};

export async function startTask(
  provider: Provider,
  config: DaemonConfig,
  id: string,
  image: string,
): Promise<Task> {
  const volume = `ho-task-spike${id}`;
  await provider.createVolume(volume, { ...labelsFor(id), "ho.kind": "task-volume" });
  await seedRepo(volume);
  const request = requestFor(id, volume);
  const plan = await step(`task ${id}: volumes`, () => prepareTaskEngine(provider, request));
  const sandbox = await step(`task ${id}: sandbox`, () =>
    provider.start(sandboxSpec(id, image, plan, volume)),
  );
  const engine = await step(`task ${id}: engine ready`, () =>
    startTaskEngine(provider, config, request, plan, sandbox),
  );
  return { id, volume, plan, sandbox, engine };
}

export async function stopTask(provider: Provider, task: Task): Promise<void> {
  await provider.stopEngine(task.engine).catch(() => null);
  await provider.remove(task.engine).catch(() => null);
  await provider.stop(task.sandbox, 5).catch(() => null);
  await provider.remove(task.sandbox).catch(() => null);
}

export const inSandbox = (task: Task, script: string): Promise<Bun.$.ShellOutput> =>
  $`docker exec ${task.sandbox.name} sh -c ${script}`.quiet().nothrow();
export const output = async (task: Task, script: string): Promise<string> =>
  (await inSandbox(task, script)).stdout.toString().trim();

export const imageOr = async (preferred: string, fallback: string): Promise<string> =>
  (await $`docker image inspect ${preferred}`.quiet().nothrow()).exitCode === 0
    ? preferred
    : fallback;

export async function sweep(provider: Provider, tasks: readonly Task[]): Promise<void> {
  const left = await provider.inventory({ "ho.managed": "true" });
  const spikes = left.containers.filter((c) => c.sessionId?.startsWith("spike") === true);
  out(`containers left: ${spikes.length === 0 ? "none" : spikes.map((c) => c.name).join(", ")}`);
  const pruned = await provider.prune({
    labels: { "ho.managed": "true", "ho.kind": "engine-socket" },
    kinds: ["volumes"],
  });
  out(`socket volumes collected: ${pruned.volumes.join(", ")}`);
  for (const task of tasks) {
    await provider.removeVolume({ name: task.volume }).catch(() => null);
    await provider.removeVolume({ name: task.plan.cacheVolume }).catch(() => null);
  }
  await $`docker network rm ${NETWORK}`.quiet().nothrow();
}
