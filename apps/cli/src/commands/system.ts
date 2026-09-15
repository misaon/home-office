import { officeUrl, startDaemon } from "@ho/daemon";
import { formatBytes } from "@ho/protocol";
import { bool } from "../flags.ts";
import { requireDaemon } from "../client.ts";
import { type Command, output } from "../cli.ts";
import { colour, line } from "../output.ts";

export const daemonCommand: Command = {
  name: "daemon",
  summary: "run the daemon in the foreground (--ui also says where the office is served)",
  booleans: ["ui"],
  run: async (parsed) => {
    const handle = await startDaemon();
    const { host, port, version } = handle.info;
    line(`daemon ${version} listening on ${host}:${String(port)} (pid ${String(process.pid)})`);
    if (bool(parsed, "ui")) {
      line(
        handle.config.ui.dir === null
          ? "office UI: not served (build it with `bun run ui:build`)"
          : `office UI: served on ${host}:${String(port)}, but the page needs this launch's token — run \`ho ui\` to open it, or \`ho ui --print\` for the URL. Opening http://${host}:${String(port)}/ without the token shows an empty office.`,
      );
    }
    // The first signal stops the daemon (bounded by its own deadline); a second one gives up waiting.
    const shutdown = (): void => {
      process.once("SIGINT", () => process.exit(130));
      process.once("SIGTERM", () => process.exit(130));
      void handle.stop().then(
        () => process.exit(0),
        (error: unknown) => {
          line(`stop failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        },
      );
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    await new Promise<never>(() => {
      // Keep the process alive until a signal arrives.
    });
    return undefined;
  },
};

export const uiCommand: Command = {
  name: "ui",
  summary: "open the office in the browser, or print its URL (the token rides in the fragment)",
  booleans: ["print"],
  run: async (parsed) => {
    const info = await requireDaemon();
    if (!info.serves.ui) {
      throw new Error(
        "this daemon serves no office UI (the build carries no bundle); use the desktop app or run the daemon from a source checkout",
      );
    }
    const url = officeUrl(info);
    if (bool(parsed, "print")) {
      return output([url], { url });
    }
    const opener =
      process.platform === "darwin"
        ? ["open", url]
        : process.platform === "win32"
          ? ["cmd", "/c", "start", "", url]
          : ["xdg-open", url];
    const code = await Bun.spawn(opener, { stdout: "ignore", stderr: "ignore" }).exited;
    if (code !== 0) {
      throw new Error(`could not open a browser (${opener[0] ?? ""} exited with ${String(code)})`);
    }
    return output(
      [`office opened at ${url.split("#")[0] ?? url} (token passed in the URL fragment)`],
      {
        url,
      },
    );
  },
};

export const healthCommand: Command = {
  name: "health",
  summary: "is a daemon up, which version, and for how long",
  run: async (_parsed, client) => {
    const rpc = await client();
    const report = await rpc.system.health();
    return output(
      [
        `${colour.ok(`daemon ${report.version}`)} up ${String(Math.round(report.uptimeMs / 1000))} s since ${report.startedAt}`,
      ],
      report,
    );
  },
};

export const doctorCommand: Command = {
  name: "doctor",
  summary: "docker, images, secrets, sessions and disk in one report",
  run: async (_parsed, client) => {
    const rpc = await client();
    const report = await rpc.system.doctor();
    const unhealthy =
      !report.provider.ok || report.images.some((image) => !image.present || !image.upToDate);
    if (unhealthy) {
      process.exitCode = 1;
    }
    const lines = [
      report.provider.ok
        ? `docker: ok ${report.provider.version} (api ${report.provider.apiVersion}, ${report.provider.os}/${report.provider.arch})`
        : `docker: FAIL ${report.provider.message}`,
      ...(report.imageContexts
        ? report.images.map(
            (image) =>
              `image ${image.ref}: ${image.present ? (image.upToDate ? "present, up to date" : "present, STALE (run: ho image build)") : "MISSING (run: ho image build)"}`,
          )
        : ["images: not inspectable — this build carries no image build contexts"]),
      `secret anthropic-oauth-token: ${report.secrets.anthropicOauthToken ? "present" : "MISSING (run: claude setup-token, then ho secret set anthropic-oauth-token)"}`,
      `sessions: ${String(report.sessions.active)} active / ${String(report.sessions.max)} max`,
      ...(report.resources === null
        ? []
        : [
            `resources: ${String(report.resources.containers)} containers, ${String(report.resources.volumes)} volumes (${formatBytes(report.resources.volumesBytes)}), images ${formatBytes(report.resources.imagesBytes)}`,
          ]),
    ];
    return output(lines, report);
  },
};

export const imageCommand: Command = {
  name: "image",
  summary: "build the agent and git-bridge images",
  subcommands: {
    build: {
      run: async (parsed, client) => {
        const json = parsed.flags["json"] === true;
        const lines: string[] = [];
        const rpc = await client();
        for await (const { line: text } of await rpc.system.buildImages()) {
          lines.push(text);
          if (!json) {
            line(text);
          }
        }
        return output(["images ready"], { ok: true, lines });
      },
    },
  },
};

export const gcCommand: Command = {
  name: "gc",
  summary: "remove stopped sandboxes, expired volumes and dangling images",
  run: async (_parsed, client) => {
    const rpc = await client();
    const report = await rpc.system.gc();
    return output(
      [
        `removed ${String(report.containers.length)} containers, ${String(report.volumes.length)} volumes, ${String(report.images.length)} images`,
        ...[...report.containers, ...report.volumes, ...report.images].map((name) => `  ${name}`),
      ],
      report,
    );
  },
};

export const resourcesCommand: Command = {
  name: "resources",
  summary: "containers and volumes the office owns, with sizes",
  run: async (_parsed, client) => {
    const rpc = await client();
    const inv = await rpc.resources.inventory();
    return output(
      [
        `containers=${String(inv.snapshot.containers)} volumes=${String(inv.snapshot.volumes)} (${formatBytes(inv.snapshot.volumesBytes)}) images=${formatBytes(inv.snapshot.imagesBytes)}`,
        ...inv.containers.map(
          (c) =>
            `container ${c.name.padEnd(30)} ${c.state.padEnd(8)} ${c.kind.padEnd(14)} ${c.createdAt}${c.sessionId === null ? "" : `  session=${c.sessionId.slice(-8)}`}`,
        ),
        ...inv.volumes.map(
          (v) =>
            `volume    ${v.name.padEnd(30)} ${formatBytes(v.sizeBytes).padStart(10)} ${v.kind.padEnd(14)} ${v.createdAt ?? "?"}${v.sessionId === null ? "" : `  session=${v.sessionId.slice(-8)}`}`,
        ),
      ],
      inv,
    );
  },
};
