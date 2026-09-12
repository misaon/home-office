// Verification harness for a task's private container engine: the real Docker adapter and a real
// engine, with a hardened stand-in for the agent container (the agent image when it is built, the
// upstream CLI image otherwise). Run it with `bun run spike:task-engine [--testcontainers]`.
import { $ } from "bun";
import { DaemonConfig } from "@ho/daemon";
import { startTaskEngine } from "@ho/daemon/task-engine";
import { createDockerProvider } from "@ho/sandbox-docker";
import {
  check,
  FALLBACK_IMAGE,
  imageOr,
  inSandbox,
  MIB,
  NETWORK,
  out,
  output,
  type Provider,
  requestFor,
  startTask,
  step,
  stopTask,
  sweep,
  type Task,
} from "./harness.ts";

const composeUp = (task: Task, project: string): Promise<Bun.$.ShellOutput> =>
  inSandbox(
    task,
    `docker compose -f /work/repo/docker-compose.yml -p ${project} up -d --wait --wait-timeout 300`,
  );

async function checkCompose(task: Task): Promise<boolean[]> {
  const up = await step("compose up --wait (cold)", () => composeUp(task, "spike"));
  const results = [
    check("compose up --wait succeeds", up.exitCode === 0, up.stderr.toString().trim().slice(-200)),
  ];
  const marker = await output(task, "docker compose -p spike logs web");
  results.push(
    check(
      "a relative bind mount resolves",
      marker.includes("same-path-bind-mount-works"),
      marker.split("\n").at(-1) ?? "",
    ),
  );
  const port = await output(
    task,
    "nc -z -w 3 127.0.0.1 15432 && echo reachable || echo unreachable",
  );
  results.push(
    check("a published port answers on the sandbox loopback", port === "reachable", port),
  );
  const limit = await output(task, "docker exec spike-web-1 cat /sys/fs/cgroup/memory.max");
  results.push(
    check(
      "compose mem_limit is not enforced (the engine's own limit is)",
      limit === String(2048 * MIB),
      `memory.max=${limit}`,
    ),
  );
  return results;
}

/** The second session of a task reuses the cache volume, so nothing is pulled again. */
async function checkWarmStart(task: Task): Promise<boolean> {
  await inSandbox(task, "docker compose -p spike down --timeout 20");
  const started = Date.now();
  const up = await composeUp(task, "spike");
  const elapsed = Date.now() - started;
  return check(
    "a warm start reuses the engine cache",
    up.exitCode === 0 && elapsed < 20_000,
    `${String(elapsed)} ms without a pull`,
  );
}

async function checkIsolation(first: Task, second: Task): Promise<boolean[]> {
  const socket = await inSandbox(first, "ls /var/run/docker.sock");
  const names = await output(second, "docker ps --format '{{.Names}}'");
  return [
    check("the daemon's socket is absent from the sandbox", socket.exitCode !== 0, ""),
    check(
      "another task's engine shows none of this task's containers",
      !names.includes("spike-web-1") && !names.includes("spike-db-1"),
      names === "" ? "(empty)" : names.replaceAll("\n", ", "),
    ),
  ];
}

/** An engine that cannot start must fail with a message that says why, and not hang the session. */
async function checkFailSoft(
  provider: Provider,
  config: DaemonConfig,
  task: Task,
): Promise<boolean> {
  const broken: DaemonConfig = {
    ...config,
    services: { ...config.services, image: "docker:no-such-tag-29.8.0-dind-rootless" },
  };
  const request = requestFor(task.id, task.volume);
  // A pull that fails creates no container, so there is nothing to clean up here.
  const failure = await startTaskEngine(provider, broken, request, task.plan, task.sandbox).then(
    () => "started, which it must not",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  return check(
    "an unusable engine image fails legibly",
    failure.includes("pulling"),
    failure.slice(0, 120),
  );
}

async function checkTestcontainers(task: Task): Promise<boolean> {
  const install = await inSandbox(
    task,
    "mkdir -p /work/tc && cd /work/tc && npm init -y >/dev/null 2>&1 && npm i --no-audit --no-fund testcontainers >/dev/null 2>&1 && echo installed",
  );
  if (install.stdout.toString().trim() !== "installed") {
    return check(
      "testcontainers",
      false,
      `npm install failed: ${install.stderr.toString().slice(-200)}`,
    );
  }
  const run = await inSandbox(
    task,
    "cp /work/repo/testcontainers.mjs /work/tc/ && cd /work/tc && bun run testcontainers.mjs",
  );
  const text = `${run.stdout.toString()}${run.stderr.toString()}`.trim();
  return check(
    "testcontainers works against the task engine",
    run.exitCode === 0,
    text.slice(-300),
  );
}

async function main(): Promise<void> {
  const config = DaemonConfig.parse({});
  const provider = createDockerProvider({ socket: config.docker.socket });
  out(`engine: ${JSON.stringify(await provider.health())}`);
  const image = await imageOr(config.docker.agentImage, FALLBACK_IMAGE);
  out(`sandbox image: ${image}`);
  const cli =
    await $`docker run --rm --entrypoint sh ${image} -c ${"command -v docker && docker compose version"}`
      .quiet()
      .nothrow();
  if (cli.exitCode !== 0) {
    out(`the sandbox image has no Docker CLI; rebuild it with \`ho image build\` first`);
    process.exitCode = 1;
    return;
  }
  await provider.ensureNetwork(NETWORK, { "ho.managed": "true", "ho.kind": "network" });
  const results: boolean[] = [];
  const tasks: Task[] = [];
  try {
    const first = await startTask(provider, config, "a", image);
    tasks.push(first);
    const compose = await checkCompose(first);
    const warm = await checkWarmStart(first);
    const second = await startTask(provider, config, "b", image);
    tasks.push(second);
    const isolation = await checkIsolation(first, second);
    const failSoft = await checkFailSoft(provider, config, second);
    const testcontainers = process.argv.includes("--testcontainers")
      ? [await checkTestcontainers(first)]
      : [];
    results.push(...compose, warm, ...isolation, failSoft, ...testcontainers);
  } finally {
    await step("teardown", async () => {
      for (const task of tasks) {
        await stopTask(provider, task);
      }
    });
    await sweep(provider, tasks);
  }
  const failed = results.filter((ok) => !ok).length;
  out(`\n${String(results.length - failed)}/${String(results.length)} checks passed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
