import type { DirectoryPick, DirectoryPickInput } from "@ho/protocol";
import { stat } from "node:fs/promises";
import { exec, type Exec } from "./host-exec.ts";

export type DirectoryPicker = (input: DirectoryPickInput) => Promise<DirectoryPick>;

const PROMPT = "Choose the repository folder";
const DIALOG_TIMEOUT_MS = 10 * 60_000;
const CANCELLED = /-128/u;

const CHOOSE = "set chosen to choose folder with prompt (item 1 of argv)";
const CHOOSE_FROM = `${CHOOSE} default location ((item 2 of argv) as POSIX file)`;

const osascript = (choose: string, args: readonly string[]): Promise<Exec> =>
  exec(
    [
      "osascript",
      ...["on run argv", choose, "return POSIX path of chosen", "end run"].flatMap((line) => [
        "-e",
        line,
      ]),
      "--",
      ...args,
    ],
    { timeoutMs: DIALOG_TIMEOUT_MS },
  );

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const found = await stat(path);
    return found.isDirectory();
  } catch {
    return false;
  }
};

const trimmed = (path: string): string => path.replace(/(?!^)\/+$/u, "");

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
  const result =
    first.code === 0 || from === null || CANCELLED.test(first.stderr)
      ? first
      : await osascript(CHOOSE, [PROMPT]);
  if (result.code === 0 && result.stdout !== "") {
    return { status: "picked", path: trimmed(result.stdout) };
  }
  return CANCELLED.test(result.stderr)
    ? { status: "cancelled" }
    : {
        status: "unavailable",
        message: result.stderr === "" ? "the directory dialog failed" : result.stderr,
      };
};
