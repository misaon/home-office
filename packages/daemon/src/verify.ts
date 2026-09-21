import {
  needsEngine,
  type SandboxProvider,
  type SandboxRunResult,
  type SandboxSpec,
  type VolumeMount,
} from "@ho/core";
import type { Project, SessionId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import {
  engineEnv,
  prepareTaskEngine,
  startTaskEngine,
  type TaskEnginePlan,
  type TaskEngineRequest,
} from "./task-engine.ts";
import { elapsedMs } from "./timing.ts";

const OUTPUT_MAX = 6000;
const TRANSCRIPT_MAX = 512 * 1024;
const OOM_EXIT_CODE = 137;
const MIB = 1024 * 1024;
const WAIT_FOR_ENGINE =
  'attempts=0; until docker version >/dev/null 2>&1; do attempts=$((attempts + 1)); if [ "$attempts" -ge "$HO_ENGINE_WAIT_SECONDS" ]; then echo "the task engine did not answer within $HO_ENGINE_WAIT_SECONDS seconds" >&2; exit 125; fi; sleep 1; done; exec /bin/sh -lc "$HO_VERIFY_COMMAND"';

export type VerifyResult = {
  ok: boolean;
  exitCode: number | null;
  output: string;
  transcript: string;
  ms: number;
};

const transcriptOf = (result: SandboxRunResult): string => {
  const text = `${result.stdout}\n${result.stderr}`;
  return text.length <= TRANSCRIPT_MAX ? text : `…\n${text.slice(-TRANSCRIPT_MAX)}`;
};

export type VerifyServices = {
  sessionId: SessionId;
  labels: Readonly<Record<string, string>>;
};

const tail = (result: SandboxRunResult): string => {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  return text.length <= OUTPUT_MAX ? text : `…\n${text.slice(-OUTPUT_MAX)}`;
};

const describe = (
  result: SandboxRunResult,
  config: DaemonConfig,
  timeoutSeconds: number,
): string => {
  if (result.timedOut) {
    return `the checks did not finish within ${String(timeoutSeconds)}s\n${tail(result)}`;
  }
  if (result.exitCode === OOM_EXIT_CODE) {
    return `the checks were killed (exit ${String(OOM_EXIT_CODE)}), most likely for exceeding the ${String(config.verify.memoryMb)} MiB the verifier is allowed\n${tail(result)}`;
  }
  return tail(result);
};

type ContainerOptions = {
  cmd: readonly string[];
  env: Readonly<Record<string, string>>;
  volumes: readonly VolumeMount[];
};

const containerSpec = (
  config: DaemonConfig,
  volume: string,
  step: string,
  network: string,
  options: ContainerOptions,
): SandboxSpec => ({
  name: `${volume}-${step}`,
  image: config.docker.agentImage,
  cmd: options.cmd,
  env: { CI: "1", HOME: "/home/agent", ...options.env },
  user: "1000:1000",
  workdir: REPO_IN_VOLUME,
  labels: { [LABELS.managed]: "true", [LABELS.kind]: "verify" },
  network,
  volumes: [{ name: volume, target: "/work" }, ...options.volumes],
  binds: [],
  tmpfs: { "/tmp": "rw,nosuid,size=256m", "/home/agent": "rw,nosuid,size=256m" },
  limits: {
    memoryBytes: config.verify.memoryMb * MIB,
    cpus: config.verify.cpus,
    pids: config.verify.pids,
  },
  readonlyRootfs: false,
  ports: [],
});

export const commandSpec = (
  config: DaemonConfig,
  volume: string,
  step: string,
  command: string,
  network: string,
): SandboxSpec =>
  containerSpec(config, volume, step, network, {
    cmd: ["/bin/sh", "-lc", command],
    env: {},
    volumes: [],
  });

const verifySpec = (
  config: DaemonConfig,
  project: Project,
  volume: string,
  engine: TaskEnginePlan | null,
): SandboxSpec => {
  const { command } = project.verify;
  if (engine === null) {
    return commandSpec(config, volume, "verify", command, "none");
  }
  return containerSpec(config, volume, "verify", "none", {
    cmd: ["/bin/sh", "-c", WAIT_FOR_ENGINE],
    env: {
      ...engineEnv(engine.mode),
      HO_VERIFY_COMMAND: command,
      HO_ENGINE_WAIT_SECONDS: String(Math.ceil(config.services.startTimeoutMs / 1000)),
    },
    volumes: [{ name: engine.socketVolume, target: engine.socketDir }],
  });
};

async function runWithServices(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
  services: VerifyServices,
): Promise<SandboxRunResult> {
  await using stack = new AsyncDisposableStack();
  const request: TaskEngineRequest = {
    mode: project.services.mode,
    role: "verify",
    sessionId: services.sessionId,
    workVolume: volume,
    labels: services.labels,
  };
  const plan = await prepareTaskEngine(provider, request, stack);
  const verifier = await provider.start(verifySpec(config, project, volume, plan));
  stack.defer(() => provider.remove(verifier).catch(() => undefined));
  const engine = await startTaskEngine(provider, config, request, plan, verifier);
  stack.defer(async () => {
    await provider.stop(engine, 15).catch(() => null);
    await provider.remove(engine).catch(() => null);
  });
  return await provider.wait(
    verifier,
    project.verify.timeoutSeconds * 1000 + config.services.startTimeoutMs,
  );
}

export async function runVerify(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
  services: VerifyServices | null,
): Promise<VerifyResult> {
  const started = Bun.nanoseconds();
  const result =
    services !== null && needsEngine(config.services.enabled, project, "work")
      ? await runWithServices(provider, config, project, volume, services)
      : await provider.run(
          verifySpec(config, project, volume, null),
          project.verify.timeoutSeconds * 1000,
        );
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    output: describe(result, config, project.verify.timeoutSeconds),
    transcript: transcriptOf(result),
    ms: elapsedMs(started),
  };
}
