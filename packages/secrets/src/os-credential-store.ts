import type { SecretStore } from "@ho/core";
import type { SecretKeyName } from "@ho/protocol";
import { secrets } from "bun";

const TIMEOUT_MS = 5000;

const STUCK =
  "the system secret store did not answer in 5 s; on macOS a build it has not seen before waits for a Keychain access prompt (approve it, or use a file-backed secret store)";

export class SecretStoreTimeoutError extends Error {
  constructor() {
    super(STUCK);
    this.name = "SecretStoreTimeoutError";
  }
}

const bounded = async <T>(work: Promise<T>): Promise<T> => {
  const timer = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new SecretStoreTimeoutError());
    }, TIMEOUT_MS).unref();
  });
  return Promise.race([work, timer]);
};

export const createOsSecretStore = (service = "home-office"): SecretStore => ({
  get: (name: SecretKeyName) => bounded(secrets.get({ service, name })),
  set: (name: SecretKeyName, value: string) => bounded(secrets.set({ service, name, value })),
  delete: async (name: SecretKeyName) => {
    await bounded(secrets.delete({ service, name }));
  },
});
