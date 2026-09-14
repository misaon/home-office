import { type LayoutSaved, type LayoutStore, OfficeLayout } from "@ho/protocol";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Reads `<repo>/layouts/*.json`, the offices drawn in the internal editor. A packaged app has no
 * repository, so `directory` is null and the store reports itself unavailable instead of pretending. A
 * file that no longer matches the schema is reported rather than silently dropped.
 */
export async function listLayouts(
  directory: string | null,
  onProblem: (file: string, reason: string) => void,
): Promise<LayoutStore> {
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
}

/** Writes `<id>.json`; the RPC boundary already validated `id` as a slug, which is what makes it a file name. */
export async function saveLayout(
  directory: string | null,
  layout: OfficeLayout,
): Promise<LayoutSaved> {
  if (directory === null) {
    throw new Error(
      "the office editor needs a source checkout to write layouts into; this build has none",
    );
  }
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${layout.id}.json`);
  await writeFile(path, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
  return { id: layout.id, path };
}
