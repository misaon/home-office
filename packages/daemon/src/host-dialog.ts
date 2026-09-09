import type { DirectoryPick, DirectoryPickInput } from "@ho/protocol";
import { stat } from "node:fs/promises";

/** Shows the host's directory dialog. The desktop app injects a native panel; osascript is the fallback. */
export type DirectoryPicker = (input: DirectoryPickInput) => Promise<DirectoryPick>;

const PROMPT = "Choose the repository folder";
/** The dialog waits for a person, so the deadline only covers one that was abandoned. */
const DIALOG_TIMEOUT_MS = 10 * 60_000;
/** AppleScript's "User canceled": a cancelled dialog is an answer, not a failure. */
const CANCELLED = /-128/u;

const CHOOSE = "set chosen to choose folder with prompt (item 1 of argv)";
const CHOOSE_FROM = `${CHOOSE} default location ((item 2 of argv) as POSIX file)`;

/**
 * The prompt and the starting directory arrive as `run argv` arguments, never as script source, so no
 * path can become AppleScript.
 */
const statements = (choose: string): string[] =>
  ["on run argv", choose, "return POSIX path of chosen", "end run"].flatMap((line) => ["-e", line]);

async function osascript(
  choose: string,
  args: readonly string[],
): Promise<{ ok: boolean; out: string; err: string }> {
  const proc = Bun.spawn(["osascript", ...statements(choose), "--", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: DIALOG_TIMEOUT_MS,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
}

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/** `choose folder` answers with a trailing slash; the rest of the office stores plain paths. */
const trimmed = (path: string): string => path.replace(/(?!^)\/+$/u, "");

/**
 * macOS `choose folder` through osascript: the directory dialog a daemon started from a terminal can
 * still show. Other platforms report `unavailable`, which the office turns into "type the path".
 */
export const osascriptDirectoryPicker: DirectoryPicker = async ({ startIn }) => {
  if (process.platform !== "darwin") {
    return {
      status: "unavailable",
      message: `no directory dialog on ${process.platform}; type the path instead`,
    };
  }
  const from = startIn !== undefined && (await isDirectory(startIn)) ? startIn : null;
  const first =
    from === null
      ? await osascript(CHOOSE, [PROMPT])
      : await osascript(CHOOSE_FROM, [PROMPT, from]);
  // A starting directory git accepts can still be one the dialog refuses; the plain dialog is not lost.
  const result =
    first.ok || from === null || CANCELLED.test(first.err)
      ? first
      : await osascript(CHOOSE, [PROMPT]);
  if (result.ok && result.out !== "") {
    return { status: "picked", path: trimmed(result.out) };
  }
  return CANCELLED.test(result.err)
    ? { status: "cancelled" }
    : {
        status: "unavailable",
        message: result.err === "" ? "the directory dialog failed" : result.err,
      };
};
