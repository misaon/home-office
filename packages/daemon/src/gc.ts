import type { PruneReport, SandboxProvider } from "@ho/core";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./images.ts";
import type { Logger } from "./logger.ts";

const INTERVAL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const merge = (a: PruneReport, b: PruneReport): PruneReport => ({
  containers: [...a.containers, ...b.containers],
  volumes: [...a.volumes, ...b.volumes],
  images: [...a.images, ...b.images],
});

/** Removes what sessions leave behind: stopped sandboxes now, task volumes after retention, dangling images. */
async function collectGarbage(
  provider: SandboxProvider,
  config: DaemonConfig,
): Promise<PruneReport> {
  const managed = { [LABELS.managed]: "true" };
  const retention = config.retention.taskVolumeHours * HOUR_MS;
  let report: PruneReport = { containers: [], volumes: [], images: [] };
  for (const kind of ["session", "bridge"]) {
    report = merge(
      report,
      await provider.prune({ labels: { ...managed, [LABELS.kind]: kind }, kinds: ["containers"] }),
    );
  }
  for (const kind of ["task-volume", "claude-config"]) {
    report = merge(
      report,
      await provider.prune({
        labels: { ...managed, [LABELS.kind]: kind },
        olderThanMs: retention,
        kinds: ["volumes"],
      }),
    );
  }
  report = merge(
    report,
    await provider.prune({ labels: { ...managed, [LABELS.kind]: "image" }, kinds: ["images"] }),
  );
  return report;
}

export function startGc(
  provider: SandboxProvider,
  config: DaemonConfig,
  log: Logger,
): { stop: () => void; runOnce: () => Promise<PruneReport> } {
  const runOnce = async (): Promise<PruneReport> => {
    const report = await collectGarbage(provider, config);
    const total = report.containers.length + report.volumes.length + report.images.length;
    if (total > 0) {
      log.info(report, "garbage collected");
    }
    return report;
  };
  void runOnce().catch((error: unknown) => {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, "initial gc failed");
  });
  const timer = setInterval(() => {
    void runOnce().catch((error: unknown) => {
      log.warn({ err: error instanceof Error ? error.message : String(error) }, "gc failed");
    });
  }, INTERVAL_MS);
  return {
    stop: () => {
      clearInterval(timer);
    },
    runOnce,
  };
}
