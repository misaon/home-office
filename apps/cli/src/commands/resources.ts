import type { Command } from "../command.ts";
import { formatBytes } from "@ho/protocol";
import { withClient } from "../client.ts";
import { jsonOutput, line, print } from "../output.ts";

async function resources(): Promise<void> {
  await withClient(async (client) => {
    const inv = await client.resources.inventory();
    if (jsonOutput()) {
      print(inv);
      return;
    }
    line(
      `containers=${String(inv.snapshot.containers)} volumes=${String(inv.snapshot.volumes)} (${formatBytes(inv.snapshot.volumesBytes)}) images=${formatBytes(inv.snapshot.imagesBytes)}`,
    );
    for (const c of inv.containers) {
      line(
        `container ${c.name.padEnd(30)} ${c.state.padEnd(8)} ${c.kind.padEnd(14)} ${c.createdAt}${c.sessionId === null ? "" : `  session=${c.sessionId.slice(-8)}`}`,
      );
    }
    for (const v of inv.volumes) {
      line(
        `volume    ${v.name.padEnd(30)} ${formatBytes(v.sizeBytes).padStart(10)} ${v.kind.padEnd(14)} ${v.createdAt ?? "?"}${v.sessionId === null ? "" : `  session=${v.sessionId.slice(-8)}`}`,
      );
    }
  });
}

export const resourcesCommand: Command = {
  name: "resources",
  summary: "containers and volumes the office owns, with sizes",
  usage: ["  ho resources"],
  run: resources,
};
