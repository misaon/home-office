import type { SecretStore } from "@ho/core";
import type { SecretKeyName } from "@ho/protocol";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { writePrivateFile } from "./private-file.ts";

const Contents = z.record(z.string(), z.string());

/** Plain JSON file with mode 0600. Used where the host has no credential store (headless servers). */
export const createFileSecretStore = (path: string): SecretStore => {
  const load = async (): Promise<Record<string, string>> => {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return {};
    }
    return Contents.parse(await file.json());
  };
  const save = async (contents: Record<string, string>): Promise<void> => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writePrivateFile(path, `${JSON.stringify(contents, null, 2)}\n`);
  };
  let pending: Promise<void> = Promise.resolve();
  const mutate = (
    update: (contents: Record<string, string>) => Record<string, string>,
  ): Promise<void> => {
    const next = pending.then(async () => save(update(await load())));
    pending = next.catch(() => undefined);
    return next;
  };
  return {
    get: async (key: SecretKeyName) => (await load())[key] ?? null,
    set: (key: SecretKeyName, value: string) =>
      mutate((contents) => ({ ...contents, [key]: value })),
    delete: (key: SecretKeyName) =>
      mutate((contents) => {
        const { [key]: _dropped, ...rest } = contents;
        return rest;
      }),
  };
};
