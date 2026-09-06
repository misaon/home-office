import { requiredSecrets, type SecretStore } from "@ho/core";
import { type Agent, SECRET_ENV } from "@ho/protocol";

const HINT: Partial<Record<keyof typeof SECRET_ENV, string>> = {
  "anthropic-oauth-token":
    "run `claude setup-token` and store the result with `ho secret set anthropic-oauth-token`",
};

/**
 * The environment an agent process signs in with, read from the secret store at session start: the
 * subscription token or API key the agent's provider and auth kind require. Never logged, never persisted.
 */
export async function secretEnvFor(
  secrets: SecretStore,
  agent: Agent,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const key of requiredSecrets(agent)) {
    const value = await secrets.get(key);
    const name = SECRET_ENV[key];
    if (value === null) {
      throw new Error(
        `secret "${key}" is missing; ${HINT[key] ?? `store it with \`ho secret set ${key}\``}`,
      );
    }
    if (name !== null) {
      env[name] = value;
    }
  }
  return env;
}
