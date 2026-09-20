import type { RunnerChannel, RunnerLine } from "@ho/core";
import { environmentDescribed, errorMessage, type SessionMode } from "@ho/protocol";
import {
  APP_LOG,
  type ApplicationReport,
  type EnvironmentReport,
  type StepReport,
} from "./environment-report.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { elapsedMs } from "./timing.ts";

const TAIL_MAX = 1200;
const KEEP_MAX = 8000;
const MIN_STEP_MS = 1000;
const READY_GRACE_MS = 5000;
const DEFAULT_READY_SECONDS = 60;

const PREPARED_MODES: ReadonlySet<SessionMode> = new Set(["work", "review", "verify"]);

const START_APP = `setsid nohup sh -lc "$HO_RUN_COMMAND" >${APP_LOG} 2>&1 </dev/null &`;

const WAIT_READY = `deadline=$(( $(date +%s) + $HO_READY_TIMEOUT )); while :; do if [ -n "$HO_READY_COMMAND" ]; then sh -lc "$HO_READY_COMMAND" >/dev/null 2>&1 && exit 0; elif [ -n "$HO_READY_URL" ]; then { curl -sf "$HO_READY_URL" >/dev/null 2>&1 || wget -q -O /dev/null "$HO_READY_URL" >/dev/null 2>&1; } && exit 0; else sleep 2; exit 0; fi; if [ "$(date +%s)" -ge "$deadline" ]; then tail -n 40 ${APP_LOG}; exit 1; fi; sleep 1; done`;

type Lines = AsyncIterator<RunnerLine>;

async function runStep(
  channel: RunnerChannel,
  lines: Lines,
  name: string,
  command: string,
  env: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<StepReport> {
  const started = Bun.nanoseconds();
  let output = "";
  let exitCode: number | null = null;
  const clock = { timedOut: false };
  try {
    await channel.spawn(["/bin/sh", "-lc", command], env, REPO_IN_VOLUME);
  } catch (error) {
    return {
      name,
      command,
      ok: false,
      exitCode: null,
      ms: elapsedMs(started),
      tail: `could not start: ${errorMessage(error)}`,
    };
  }
  const timer = setTimeout(() => {
    clock.timedOut = true;
    channel.signal("SIGKILL");
  }, timeoutMs);
  try {
    for (;;) {
      const step = await lines.next();
      if (step.done === true) {
        break;
      }
      const line = step.value;
      if (line.stream === "exit") {
        exitCode = line.code;
        break;
      }
      output = `${output}${line.text}${line.stream === "stdout" ? "\n" : ""}`.slice(-KEEP_MAX);
    }
  } finally {
    clearTimeout(timer);
  }
  const tail = output.trim().slice(-TAIL_MAX);
  return {
    name,
    command,
    ok: exitCode === 0 && !clock.timedOut,
    exitCode,
    ms: elapsedMs(started),
    tail: clock.timedOut
      ? `${tail}\n(killed after ${String(Math.round(timeoutMs / 1000))} s)`
      : tail,
  };
}

type Planned = { name: string; command: string };

const plannedSteps = (ctx: SessionContext, provisioned: Provisioned): Planned[] => {
  const { environment } = ctx.project;
  const services =
    provisioned.services.kind === "ready"
      ? environment.services.map((command) => ({ name: "services", command }))
      : [];
  return [
    ...environment.setup.map((command) => ({ name: "setup", command })),
    ...services,
    ...environment.seed.map((command) => ({ name: "seed", command })),
  ];
};

async function startApplication(
  ctx: SessionContext,
  channel: RunnerChannel,
  lines: Lines,
  run: string,
  remaining: () => number,
): Promise<ApplicationReport> {
  const started = Bun.nanoseconds();
  const probe = ctx.project.environment.ready;
  const readySeconds = probe?.timeoutSeconds ?? DEFAULT_READY_SECONDS;
  const launch = await runStep(
    channel,
    lines,
    "run",
    START_APP,
    { HO_RUN_COMMAND: run },
    remaining(),
  );
  const ready = launch.ok
    ? await runStep(
        channel,
        lines,
        "ready",
        WAIT_READY,
        {
          HO_READY_URL: probe?.url ?? "",
          HO_READY_COMMAND: probe?.command ?? "",
          HO_READY_TIMEOUT: String(readySeconds),
        },
        Math.min(remaining(), readySeconds * 1000 + READY_GRACE_MS),
      )
    : launch;
  return {
    command: run,
    url: probe?.url ?? null,
    ready: ready.ok,
    ms: elapsedMs(started),
    tail: ready.ok ? "" : ready.tail,
  };
}

export async function prepareEnvironment(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
): Promise<EnvironmentReport | null> {
  const { environment } = ctx.project;
  if (!PREPARED_MODES.has(ctx.session.mode) || !environmentDescribed(environment)) {
    return null;
  }
  const { channel } = provisioned.connection;
  const lines = channel.lines()[Symbol.asyncIterator]();
  const started = Bun.nanoseconds();
  const budgetMs = environment.timeoutSeconds * 1000;
  const remaining = (): number => Math.max(MIN_STEP_MS, budgetMs - elapsedMs(started));
  const steps: StepReport[] = [];
  for (const step of plannedSteps(ctx, provisioned)) {
    ctx.signal.throwIfAborted();
    const report = await runStep(channel, lines, step.name, step.command, {}, remaining());
    steps.push(report);
    if (!report.ok) {
      break;
    }
  }
  const healthy = steps.every((step) => step.ok);
  const application =
    healthy && environment.run !== undefined
      ? await startApplication(ctx, channel, lines, environment.run, remaining)
      : null;
  const report: EnvironmentReport = { steps, application };
  deps.traces.write(ctx.session.id, { kind: "environment", ...report }, true);
  deps.log.info(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      steps: steps.map((step) => ({ name: step.name, ok: step.ok, ms: step.ms })),
      application: application === null ? null : { ready: application.ready, ms: application.ms },
      totalMs: elapsedMs(started),
    },
    "environment prepared",
  );
  return report;
}
