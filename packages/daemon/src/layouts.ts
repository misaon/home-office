import { type LayoutSaved, type LayoutStore, OfficeLayout } from "@ho/protocol";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Offices drawn in the internal editor, kept as JSON beside the code they belong to. */
export type LayoutStoreAdapter = {
  list: () => Promise<LayoutStore>;
  save: (layout: OfficeLayout) => Promise<LayoutSaved>;
};

const unavailable = (): never => {
  throw new Error(
    "the office editor needs a source checkout to write layouts into; this build has none",
  );
};

/**
 * Reads and writes `<repo>/layouts/*.json`. A packaged app has no repository, so `directory` is null and
 * the store reports itself unavailable instead of pretending to save. A file that no longer matches the
 * schema is reported rather than silently dropped.
 */
export function createLayoutStore(
  directory: string | null,
  onProblem: (file: string, reason: string) => void,
): LayoutStoreAdapter {
  return {
    list: async () => {
      if (directory === null) {
        return { available: false, directory: null, layouts: [] };
      }
      const files = await readdir(directory).catch(() => []);
      const layouts: OfficeLayout[] = [];
      for (const file of files.filter((name) => name.endsWith(".json")).toSorted()) {
        const text = await readFile(join(directory, file), "utf8").catch(() => null);
        if (text === null) {
          onProblem(file, "cannot be read");
          continue;
        }
        const parsed = OfficeLayout.safeParse(parseJson(text));
        if (parsed.success) {
          layouts.push(parsed.data);
        } else {
          onProblem(file, parsed.error.issues[0]?.message ?? "does not match the layout schema");
        }
      }
      return { available: true, directory, layouts };
    },
    save: async (layout) => {
      if (directory === null) {
        return unavailable();
      }
      // Parsed again here, not only at the RPC boundary: `id` is what names the file.
      const checked = OfficeLayout.parse(layout);
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${checked.id}.json`);
      await writeFile(path, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
      return { id: checked.id, path };
    },
  };
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
