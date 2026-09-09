import {
  type AgentRole,
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

/**
 * Effort a new agent starts at, by what the role actually does: the agents that change the repository think
 * hard, triage and errands do not. `xhigh` and `max` stay a deliberate per-agent choice in Settings.
 */
const EFFORT_BY_ROLE: Readonly<Record<AgentRole, EffortLevel>> = {
  boss: "medium",
  worker: "high",
  reviewer: "high",
  clerk: "low",
};

/** Claude Code aliases per role (D12); other providers start from their catalog default. */
const CLAUDE_MODEL_BY_ROLE: Readonly<Record<AgentRole, string>> = {
  boss: "opus",
  worker: "sonnet",
  reviewer: "sonnet",
  clerk: "haiku",
};

/** The catalog's defaults for a provider and role; both fall back to the provider's own defaults. */
export const defaultChoice = (
  provider: ProviderId,
  role: AgentRole = "worker",
): Omit<AgentChoice, "provider"> => {
  const p = PROVIDERS[provider];
  const wanted = EFFORT_BY_ROLE[role];
  const model = provider === "claude-code" ? CLAUDE_MODEL_BY_ROLE[role] : p.defaultModel;
  return {
    auth: p.defaultAuth,
    model: p.models.some((m) => m.id === model) || p.freeFormModels ? model : p.defaultModel,
    effort: p.effortLevels.includes(wanted) ? wanted : (p.effortLevels[0] ?? "medium"),
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
