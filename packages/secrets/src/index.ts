import type { SecretStore } from "@ho/core";
import { join } from "node:path";
import { createFileSecretStore } from "./file.ts";
import { createKeychainSecretStore } from "./keychain.ts";

export { createFileSecretStore, createKeychainSecretStore };

/** Keychain on macOS, a 0600 file elsewhere. */
export const createSecretStore = (
  home: string,
  platform: NodeJS.Platform = process.platform,
): SecretStore =>
  platform === "darwin"
    ? createKeychainSecretStore()
    : createFileSecretStore(join(home, "secrets.json"));
