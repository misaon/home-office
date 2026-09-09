import type { SecretStore } from "@ho/core";
import type { SecretKeyName } from "@ho/protocol";
import { secrets } from "bun";

const TIMEOUT_MS = 5_000;

const STUCK =
  "the system secret store did not answer in 5 s; on macOS a build it has not seen before waits for a Keychain access prompt (approve it, or use a file-backed secret store)";

/** Distinct from "there is no secret service here", which is what makes `auto` fall back to a file. */
export class SecretStoreTimeout extends Error {
  constructor() {
    super(STUCK);
    this.name = "SecretStoreTimeout";
  }
}

const bounded = async <T>(work: Promise<T>): Promise<T> => {
  const timer = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new SecretStoreTimeout());
    }, TIMEOUT_MS).unref();
  });
  return Promise.race([work, timer]);
};

/** `Bun.secrets`: Keychain Services on macOS, libsecret on Linux, Credential Manager on Windows. */
export const createOsSecretStore = (service = "home-office"): SecretStore => ({
  get: (name: SecretKeyName) => bounded(secrets.get({ service, name })),
  set: (name: SecretKeyName, value: string) => bounded(secrets.set({ service, name, value })),
  delete: async (name: SecretKeyName) => {
    await bounded(secrets.delete({ service, name }));
  },
});
