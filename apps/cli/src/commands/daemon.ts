import { startDaemon } from "@ho/daemon";
import { parse } from "../args.ts";
import { line } from "../output.ts";

/** Runs the daemon in the foreground; `--ui` also prints where the office UI is served (token stays in daemon.json). */
export async function daemon(args: readonly string[]): Promise<void> {
  const parsed = parse(args, [], ["ui"]);
  const handle = await startDaemon();
  const { host, port, version } = handle.info;
  line(`daemon ${version} listening on ${host}:${String(port)} (pid ${String(process.pid)})`);
  if (parsed.flags["ui"] === true) {
    line(
      handle.config.ui.dir === null
        ? "office UI: not served (build it with `bun run ui:build`)"
        : `office UI: http://${host}:${String(port)}/ — the token is in daemon.json (0600); \`ho ui\` opens the UI with it`,
    );
  }
  const shutdown = (): void => {
    void handle.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise<never>(() => {
    // Keep the process alive until a signal arrives.
  });
}
