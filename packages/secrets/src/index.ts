import type { SecretStore } from "@ho/core";
import { join } from "node:path";
import { createFileSecretStore } from "./file.ts";
import { createKeychainSecretStore } from "./keychain.ts";

export { createFileSecretStore, createKeychainSecretStore };

export type SecretStoreKind = "auto" | "keychain" | "file";

/** Keychain on macOS, a 0600 file elsewhere; `kind` overrides the platform default (tests, servers). */
export const createSecretStore = (
  home: string,
  kind: SecretStoreKind = "auto",
  platform: NodeJS.Platform = process.platform,
): SecretStore => {
  const useKeychain = kind === "keychain" || (kind === "auto" && platform === "darwin");
  return useKeychain
    ? createKeychainSecretStore()
    : createFileSecretStore(join(home, "secrets.json"));
};

export { writePrivateFile } from "./private-file.ts";
