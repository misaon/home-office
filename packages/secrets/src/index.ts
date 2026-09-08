import type { SecretStore } from "@ho/core";
import { errorMessage, type SecretKeyName } from "@ho/protocol";
import { join } from "node:path";
import { createFileSecretStore } from "./file.ts";
import { createOsSecretStore, SecretStoreTimeout } from "./os-credential-store.ts";

export { createFileSecretStore, createOsSecretStore };

export type SecretStoreKind = "auto" | "os" | "file";

type Operation<T> = (store: SecretStore) => Promise<T>;

/**
 * `auto` uses the OS credential store and falls back to the file store when the host has none — which
 * platform this is does not decide it, whether the store answers does. A timeout is not an absent store:
 * it means the store is there and waiting for the user, so it propagates instead of downgrading silently.
 */
const withFileFallback = (
  os: SecretStore,
  file: SecretStore,
  onFallback: (reason: string) => void,
): SecretStore => {
  let chosen: SecretStore | null = null;
  const run = async <T>(operation: Operation<T>): Promise<T> => {
    if (chosen !== null) {
      return operation(chosen);
    }
    try {
      const value = await operation(os);
      chosen = os;
      return value;
    } catch (error) {
      if (error instanceof SecretStoreTimeout) {
        throw error;
      }
      chosen = file;
      onFallback(errorMessage(error));
      return operation(file);
    }
  };
  return {
    get: (key: SecretKeyName) => run((store) => store.get(key)),
    set: (key: SecretKeyName, value: string) => run((store) => store.set(key, value)),
    delete: (key: SecretKeyName) => run((store) => store.delete(key)),
  };
};

export const createSecretStore = (
  home: string,
  kind: SecretStoreKind = "auto",
  onFallback: (reason: string) => void = () => undefined,
): SecretStore => {
  const file = (): SecretStore => createFileSecretStore(join(home, "secrets.json"));
  if (kind === "file") {
    return file();
  }
  if (kind === "os") {
    return createOsSecretStore();
  }
  return withFileFallback(createOsSecretStore(), file(), onFallback);
};

export { writePrivateFile } from "./private-file.ts";
