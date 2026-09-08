import type { Command } from "../command.ts";
import { withClient } from "../client.ts";
import { colour, result } from "../output.ts";

async function health(): Promise<void> {
  await withClient(async (client) => {
    const report = await client.system.health();
    result(
      `${colour.ok("daemon " + report.version)} up ${String(Math.round(report.uptimeMs / 1000))} s since ${report.startedAt}`,
      report,
    );
  });
}

export const healthCommand: Command = {
  name: "health",
  summary: "is a daemon up, which version, and for how long",
  usage: ["  ho health"],
  run: health,
};
