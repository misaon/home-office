import type { Command } from "../command.ts";
import { formatBytes } from "@ho/protocol";
import { withClient } from "../client.ts";
import { jsonOutput, line, print } from "../output.ts";

const unhealthy = (report: {
  provider: { ok: boolean };
  images: readonly { present: boolean; upToDate: boolean }[];
}): boolean =>
  !report.provider.ok || report.images.some((image) => !image.present || !image.upToDate);

async function doctor(): Promise<void> {
  await withClient(async (client) => {
    const report = await client.system.doctor();
    if (unhealthy(report)) {
      process.exitCode = 1;
    }
    if (jsonOutput()) {
      print(report);
      return;
    }
    line(
      report.provider.ok
        ? `docker: ok ${report.provider.version} (api ${report.provider.apiVersion}, ${report.provider.os}/${report.provider.arch})`
        : `docker: FAIL ${report.provider.message}`,
    );
    if (report.imageContexts) {
      for (const image of report.images) {
        line(
          `image ${image.ref}: ${image.present ? (image.upToDate ? "present, up to date" : "present, STALE (run: ho image build)") : "MISSING (run: ho image build)"}`,
        );
      }
    } else {
      line("images: not inspectable — this build carries no image build contexts");
    }
    line(
      `secret anthropic-oauth-token: ${report.secrets.anthropicOauthToken ? "present" : "MISSING (run: claude setup-token, then ho secret set anthropic-oauth-token)"}`,
    );
    line(`sessions: ${String(report.sessions.active)} active / ${String(report.sessions.max)} max`);
    if (report.resources !== null) {
      line(
        `resources: ${String(report.resources.containers)} containers, ${String(report.resources.volumes)} volumes (${formatBytes(report.resources.volumesBytes)}), images ${formatBytes(report.resources.imagesBytes)}`,
      );
    }
  });
}

export const doctorCommand: Command = {
  name: "doctor",
  summary: "docker, images, secrets, sessions and disk in one report",
  usage: ["  ho doctor"],
  run: doctor,
};
