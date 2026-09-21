import { isTerminal, type PruneReport, type ReadModel, type SandboxProvider } from "@ho/core";
import { errorMessage } from "@ho/protocol";
import type { AttachmentStore } from "./attachments.ts";
import type { DaemonConfig } from "./config.ts";
import { LABELS, MANAGED } from "./labels.ts";
import type { Logger } from "./logger.ts";
import { elapsedMs } from "./timing.ts";
import type { TraceStore } from "./traces.ts";
import { cacheVolumeFor, taskVolumeFor } from "./volumes.ts";

const INTERVAL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const VOLUME_KINDS = ["task-volume", "review-volume", "provider-state", "engine-cache"] as const;
const TRANSIENT_VOLUME_KINDS = ["engine-socket"] as const;
const REAPED_CONTAINER_KINDS: ReadonlySet<string> = new Set(["session", "engine"]);

const merge = (a: PruneReport, b: PruneReport): PruneReport => ({
  containers: [...a.containers, ...b.containers],
  volumes: [...a.volumes, ...b.volumes],
  images: [...a.images, ...b.images],
});

const protectedVolumes = (model: ReadModel): ((name: string) => boolean) => {
  const prefixes = [...model.tasks.values()]
    .filter((task) => !isTerminal(task.status))
    .map((task) => taskVolumeFor(task.id));
  return (name) => prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}-`));
};

async function reapOrphans(
  provider: SandboxProvider,
  model: ReadModel,
  log: Logger,
): Promise<string[]> {
  const active = new Set<string>(model.activeSessions);
  const reaped: string[] = [];
  for (const container of await provider.containers(MANAGED)) {
    if (
      container.state !== "running" ||
      !REAPED_CONTAINER_KINDS.has(container.kind) ||
      container.sessionId === null ||
      active.has(container.sessionId)
    ) {
      continue;
    }
    const handle = { id: container.name, name: container.name };
    await provider.stop(handle, 2).catch(() => null);
    await provider.remove(handle).catch(() => null);
    reaped.push(container.name);
    log.warn(
      { container: container.name, sessionId: container.sessionId },
      "stopped a container whose session is no longer active",
    );
  }
  return reaped;
}

async function collectGarbage(
  provider: SandboxProvider,
  config: DaemonConfig,
  model: ReadModel,
  log: Logger,
): Promise<PruneReport> {
  const retention = config.retention.taskVolumeHours * HOUR_MS;
  const keep = protectedVolumes(model);
  let report: PruneReport = {
    containers: await reapOrphans(provider, model, log),
    volumes: [],
    images: [],
  };
  for (const kind of ["session", "engine", "bridge", "verify"]) {
    report = merge(
      report,
      await provider.prune({ labels: { ...MANAGED, [LABELS.kind]: kind }, kinds: ["containers"] }),
    );
  }
  for (const kind of VOLUME_KINDS) {
    report = merge(
      report,
      await provider.prune({
        labels: { ...MANAGED, [LABELS.kind]: kind },
        olderThanMs: retention,
        kinds: ["volumes"],
        keep,
      }),
    );
  }
  const caches = new Set([...model.projects.values()].map((project) => cacheVolumeFor(project.id)));
  report = merge(
    report,
    await provider.prune({
      labels: { ...MANAGED, [LABELS.kind]: "project-cache" },
      kinds: ["volumes"],
      keep: (name) => caches.has(name),
    }),
  );
  for (const kind of TRANSIENT_VOLUME_KINDS) {
    report = merge(
      report,
      await provider.prune({ labels: { ...MANAGED, [LABELS.kind]: kind }, kinds: ["volumes"] }),
    );
  }
  report = merge(
    report,
    await provider.prune({ labels: { ...MANAGED, [LABELS.kind]: "image" }, kinds: ["images"] }),
  );
  return report;
}

export function startGc(
  provider: SandboxProvider,
  config: DaemonConfig,
  log: Logger,
  traces: TraceStore,
  model: ReadModel,
  attachments: AttachmentStore,
): { stop: () => Promise<void>; runOnce: () => Promise<PruneReport> } {
  const collect = async (): Promise<PruneReport> => {
    const started = Bun.nanoseconds();
    const report = await collectGarbage(provider, config, model, log);
    const prunedTraces = await traces.prune(config.retention.traceDays);
    const prunedBrowser = await attachments.pruneBrowser(config.retention.traceDays);
    const counts = {
      containers: report.containers.length,
      volumes: report.volumes.length,
      images: report.images.length,
      traces: prunedTraces + prunedBrowser,
    };
    log.debug({ ...counts, ms: elapsedMs(started) }, "gc ran");
    if (counts.containers + counts.volumes + counts.images + counts.traces > 0) {
      log.info({ ...report, traces: prunedTraces }, "garbage collected");
    }
    return report;
  };
  let pending: Promise<PruneReport> | null = null;
  const runOnce = (): Promise<PruneReport> => {
    pending ??= collect().finally(() => {
      pending = null;
    });
    return pending;
  };
  void runOnce().catch((error: unknown) => {
    log.warn({ err: errorMessage(error) }, "initial gc failed");
  });
  const timer = setInterval(() => {
    void runOnce().catch((error: unknown) => {
      log.warn({ err: errorMessage(error) }, "gc failed");
    });
  }, INTERVAL_MS);
  return {
    stop: async () => {
      clearInterval(timer);
      await pending?.catch(() => null);
    },
    runOnce,
  };
}
