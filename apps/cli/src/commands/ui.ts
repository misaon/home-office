import { daemonUrl, readDaemonInfo, resolveHome } from "@ho/daemon";
import { parse } from "../args.ts";
import { line } from "../output.ts";

/**
 * Opens the office UI served by the daemon. The daemon token travels in the URL fragment, which the
 * browser keeps to itself; the page moves it into sessionStorage and clears the address bar.
 */
export async function ui(args: readonly string[]): Promise<void> {
  const parsed = parse(args, [], ["print"]);
  const home = resolveHome();
  const info = await readDaemonInfo(home);
  if (info === null) {
    throw new Error(
      `no running daemon found (${home}/daemon.json missing); start one with \`ho daemon\``,
    );
  }
  const url = `${daemonUrl(info)}/#token=${info.token}`;
  if (parsed.flags["print"] === true) {
    line(url);
    return;
  }
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const proc = Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  line(`office opened at ${daemonUrl(info)}/ (token passed in the URL fragment)`);
}
