import {
  type Agent,
  type AgentRole,
  conflict,
  type DomainError,
  EffortLevel,
  PROVIDERS,
  type ProviderId,
} from "@ho/protocol";
import { err, ok, type Result } from "./result.ts";

type AgentChoice = Pick<Agent, "provider" | "auth" | "model" | "effort">;

const EFFORT_BY_ROLE: Readonly<Record<AgentRole, EffortLevel>> = {
  boss: "medium",
  secretary: "low",
  analyst: "high",
  backend: "high",
  frontend: "high",
  devops: "high",
  qa: "high",
  security: "high",
  head: "high",
  developer: "high",
};

const CLAUDE_MODEL_BY_ROLE: Readonly<Record<AgentRole, string>> = {
  boss: "opus",
  secretary: "haiku",
  analyst: "opus",
  backend: "sonnet",
  frontend: "sonnet",
  devops: "sonnet",
  qa: "sonnet",
  security: "opus",
  head: "opus",
  developer: "sonnet",
};

const rank = (level: EffortLevel): number => EffortLevel.options.indexOf(level);

export const nearestEffort = (
  wanted: EffortLevel,
  available: readonly EffortLevel[],
): EffortLevel => {
  if (available.length === 0 || available.includes(wanted)) {
    return wanted;
  }
  const below = available.filter((level) => rank(level) < rank(wanted));
  const pool = below.length > 0 ? below : available;
  const pick = below.length > 0 ? Math.max : Math.min;
  const target = pick(...pool.map((level) => rank(level)));
  return pool.find((level) => rank(level) === target) ?? wanted;
};

export const defaultChoice = (
  provider: ProviderId,
  role: AgentRole = "developer",
): Omit<AgentChoice, "provider"> => {
  const p = PROVIDERS[provider];
  const wanted = EFFORT_BY_ROLE[role];
  const model = provider === "claude-code" ? CLAUDE_MODEL_BY_ROLE[role] : p.defaultModel;
  return {
    auth: p.defaultAuth,
    model: p.models.some((m) => m.id === model) || p.freeFormModels ? model : p.defaultModel,
    effort: p.effortLevels.length === 0 ? "medium" : nearestEffort(wanted, p.effortLevels),
  };
};

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
