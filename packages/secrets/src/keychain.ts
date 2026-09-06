import type { SecretKey, SecretStore } from "@ho/core";
import { $ } from "bun";

const SERVICE = "home-office";
/** `security` exits with 44 when no matching item exists. */
const NOT_FOUND = 44;

/**
 * macOS Keychain via the `security` CLI. Values pass through argv for `set` (the tool has no
 * stdin mode); the daemon runs locally and the exposure is limited to the process table.
 */
export const createKeychainSecretStore = (service = SERVICE): SecretStore => ({
  get: async (key: SecretKey) => {
    const result = await $`security find-generic-password -s ${service} -a ${key} -w`
      .quiet()
      .nothrow();
    if (result.exitCode === NOT_FOUND) {
      return null;
    }
    if (result.exitCode !== 0) {
      throw new Error(`keychain read failed for ${key}: ${result.stderr.toString().trim()}`);
    }
    return result.stdout.toString().trim();
  },
  set: async (key: SecretKey, value: string) => {
    await $`security add-generic-password -U -s ${service} -a ${key} -w ${value}`.quiet();
  },
  delete: async (key: SecretKey) => {
    const result = await $`security delete-generic-password -s ${service} -a ${key}`
      .quiet()
      .nothrow();
    if (result.exitCode !== 0 && result.exitCode !== NOT_FOUND) {
      throw new Error(`keychain delete failed for ${key}: ${result.stderr.toString().trim()}`);
    }
  },
});
