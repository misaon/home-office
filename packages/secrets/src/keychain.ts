import type { SecretStore } from "@ho/core";
import { secrets } from "bun";

export const createKeychainSecretStore = (service = "home-office"): SecretStore => ({
  get: (name) => secrets.get({ service, name }),
  set: (name, value) => secrets.set({ service, name, value }),
  delete: async (name) => {
    await secrets.delete({ service, name });
  },
});
