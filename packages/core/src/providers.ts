import {
  type AuthKind,
  type EffortLevel,
  PROVIDERS,
  type ProviderId,
  type SecretKeyName,
  secretKeysFor,
} from "@ho/protocol";
import { conflict, type DomainError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

export type AgentChoice = {
  provider: ProviderId;
  auth: AuthKind;
  model: string;
  effort: EffortLevel;
};

/** The catalog's defaults for a provider; effort falls back to `medium` where the CLI has no knob. */
export const defaultChoice = (provider: ProviderId): Omit<AgentChoice, "provider"> => {
  const p = PROVIDERS[provider];
  return {
    auth: p.defaultAuth,
    model: p.defaultModel,
    effort: p.effortLevels.includes("medium") ? "medium" : (p.effortLevels[0] ?? "medium"),
  };
};

/** Rejects provider/auth/model/effort combinations the catalog does not offer. */
export function validateChoice(choice: AgentChoice): Result<AgentChoice, DomainError> {
  const p = PROVIDERS[choice.provider];
  if (!p.authKinds.includes(choice.auth)) {
    return err(conflict(`${p.name} supports ${p.authKinds.join("/")} auth, not ${choice.auth}`));
  }
  if (!p.freeFormModels && !p.models.some((m) => m.id === choice.model)) {
    return err(
      conflict(
        `${p.name} has no model "${choice.model}"; pick one of ${p.models.map((m) => m.id).join(", ")}`,
      ),
    );
  }
  if (p.effortLevels.length > 0 && !p.effortLevels.includes(choice.effort)) {
    return err(conflict(`${p.name} effort must be one of ${p.effortLevels.join(", ")}`));
  }
  return ok(choice);
}

/** Secrets a session needs before it can start, in the order the runtime expects them. */
export const requiredSecrets = (choice: AgentChoice): SecretKeyName[] =>
  secretKeysFor(choice.provider, choice.auth, choice.model);
