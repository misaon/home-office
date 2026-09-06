import { withClient } from "../client.ts";
import { line } from "../output.ts";

const mb = (bytes: number | null): string =>
  bytes === null ? "?" : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function resources(): Promise<void> {
  await withClient(async (client) => {
    const inv = await client.resources.inventory();
    line(
      `containers=${String(inv.snapshot.containers)} volumes=${String(inv.snapshot.volumes)} (${mb(inv.snapshot.volumesBytes)}) images=${mb(inv.snapshot.imagesBytes)}`,
    );
    for (const c of inv.containers) {
      line(
        `container ${c.name.padEnd(30)} ${c.state.padEnd(8)} ${c.kind.padEnd(14)} ${c.createdAt}${c.sessionId === null ? "" : `  session=${c.sessionId.slice(-8)}`}`,
      );
    }
    for (const v of inv.volumes) {
      line(
        `volume    ${v.name.padEnd(30)} ${mb(v.sizeBytes).padStart(10)} ${v.kind.padEnd(14)} ${v.createdAt ?? "?"}${v.sessionId === null ? "" : `  session=${v.sessionId.slice(-8)}`}`,
      );
    }
  });
}
