import { withClient } from "../client.ts";
import { line } from "../output.ts";

const gb = (bytes: number): string => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

export async function doctor(): Promise<void> {
  await withClient(async (client) => {
    const report = await client.system.doctor();
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
      `secret anthropic-oauth-token: ${report.secrets.anthropicOauthToken ? "present" : "MISSING (claude setup-token → Keychain)"}`,
    );
    if (!report.provider.ok || report.images.some((image) => !image.present || !image.upToDate)) {
      process.exitCode = 1;
    }
    line(`sessions: ${String(report.sessions.active)} active / ${String(report.sessions.max)} max`);
    if (report.resources !== null) {
      line(
        `resources: ${String(report.resources.containers)} containers, ${String(report.resources.volumes)} volumes (${gb(report.resources.volumesBytes)}), images ${gb(report.resources.imagesBytes)}`,
      );
    }
  });
}
