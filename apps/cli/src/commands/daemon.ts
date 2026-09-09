import type { Command } from "../command.ts";
import { startDaemon } from "@ho/daemon";
import { parse } from "../args.ts";
import { line } from "../output.ts";

/** Runs the daemon in the foreground; `--ui` also prints where the office UI is served (token stays in daemon.json). */
async function daemon(args: readonly string[]): Promise<void> {
  const parsed = parse(args, [], ["ui"]);
  const handle = await startDaemon();
  const { host, port, version } = handle.info;
  line(`daemon ${version} listening on ${host}:${String(port)} (pid ${String(process.pid)})`);
  if (parsed.flags["ui"] === true) {
    line(
      handle.config.ui.dir === null
        ? "office UI: not served (build it with `bun run ui:build`)"
        : `office UI: served on ${host}:${String(port)}, but the page needs this launch's token — run \`ho ui\` to open it, or \`ho ui --print\` for the URL. Opening http://${host}:${String(port)}/ without the token shows an empty office.`,
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

export const daemonCommand: Command = {
  name: "daemon",
  summary: "run the daemon in the foreground (--ui also prints the office URL)",
  usage: ["  ho daemon [--ui]"],
  run: daemon,
};
