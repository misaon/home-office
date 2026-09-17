import {
  type Agent,
  type AgentRole,
  conflict,
  type DomainError,
  type EffortLevel,
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
    effort: p.effortLevels.includes(wanted) ? wanted : (p.effortLevels[0] ?? "medium"),
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
