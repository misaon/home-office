import type { Command } from "../command.ts";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

async function gc(): Promise<void> {
  await withClient(async (client) => {
    const report = await client.system.gc();
    line(
      `removed ${String(report.containers.length)} containers, ${String(report.volumes.length)} volumes, ${String(report.images.length)} images`,
    );
    for (const name of [...report.containers, ...report.volumes, ...report.images]) {
      line(`  ${name}`);
    }
  });
}

export const gcCommand: Command = {
  name: "gc",
  summary: "remove stopped sandboxes, expired volumes and dangling images",
  usage: ["  ho gc"],
  run: gc,
};
