import type { DirectoryPicker } from "@ho/daemon";
import { Utils } from "electrobun/main";

/** A native open panel owned by this app, instead of the osascript dialog a lone daemon falls back to. */
export const nativeDirectoryPicker: DirectoryPicker = async ({ startIn }) => {
  const chosen = await Utils.openFileDialog({
    startingFolder: startIn ?? "~/",
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  });
  const path = (chosen[0] ?? "").replace(/(?!^)\/+$/u, "");
  return path === "" ? { status: "cancelled" } : { status: "picked", path };
};
