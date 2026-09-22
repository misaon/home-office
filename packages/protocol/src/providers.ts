import { z } from "zod";
import { type AuthKind, EffortLevel, type ProviderId } from "./domain.ts";

export const SecretKeyName = z.enum([
  "anthropic-oauth-token",
  "anthropic-api-key",
  "openai-api-key",
  "gemini-api-key",
  "github-token",
]);
export type SecretKeyName = z.infer<typeof SecretKeyName>;

type ModelDescriptor = { id: string; label: string };

export type BudgetGuarantee = "runtime" | "office" | "none";

export type BudgetGuarantees = { turns: BudgetGuarantee; usd: BudgetGuarantee };

type ProviderDescriptor = {
  id: ProviderId;
  name: string;
  protocol: "stream-json" | "acp";
  authKinds: readonly AuthKind[];
  defaultAuth: AuthKind;
  models: readonly ModelDescriptor[];
  defaultModel: string;
  freeFormModels: boolean;
  effortLevels: readonly EffortLevel[];
  economyModels: Readonly<Record<string, string>>;
  guarantees: BudgetGuarantees;
  stateDir: string;
  scratchDirs: readonly string[];
  image: ProviderId;
  notes: string;
};

const HOME = "/home/agent";

const ACP_GUARANTEES: BudgetGuarantees = { turns: "office", usd: "office" };

export const budgetGuaranteesFor = (provider: ProviderId, auth: AuthKind): BudgetGuarantees => {
  const { guarantees } = PROVIDERS[provider];
  return provider === "claude-code" && auth !== "api-key"
    ? { ...guarantees, usd: "none" }
    : guarantees;
};

export const PROVIDERS: Readonly<Record<ProviderId, ProviderDescriptor>> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    protocol: "stream-json",
    authKinds: ["subscription", "api-key"],
    defaultAuth: "subscription",
    models: [
      { id: "fable", label: "Fable (latest)" },
      { id: "opus", label: "Opus (latest)" },
      { id: "sonnet", label: "Sonnet (latest)" },
      { id: "haiku", label: "Haiku (latest)" },
    ],
    defaultModel: "sonnet",
    freeFormModels: true,
    effortLevels: EffortLevel.options,
    economyModels: { "*": "haiku" },
    guarantees: { turns: "runtime", usd: "runtime" },
    stateDir: `${HOME}/.claude`,
    scratchDirs: [],
    image: "claude-code",
    notes:
      "Subscription via `claude setup-token`, or an Anthropic API key with an optional per-session budget in USD.",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    protocol: "acp",
    authKinds: ["api-key", "none"],
    defaultAuth: "api-key",
    models: [
      { id: "anthropic/claude-sonnet-5", label: "Anthropic · Claude Sonnet 5 (API key)" },
      { id: "anthropic/claude-haiku-4-5", label: "Anthropic · Claude Haiku 4.5 (API key)" },
      { id: "openai/gpt-5", label: "OpenAI · GPT-5 (API key)" },
      { id: "google/gemini-3.8-flash", label: "Google · Gemini 3.8 Flash (API key)" },
      { id: "ollama/qwen3-coder", label: "Ollama on this Mac · qwen3-coder (no key)" },
    ],
    defaultModel: "anthropic/claude-sonnet-5",
    freeFormModels: true,
    effortLevels: [],
    economyModels: { anthropic: "anthropic/claude-haiku-4-5" },
    guarantees: ACP_GUARANTEES,
    stateDir: `${HOME}/.local/share/opencode`,
    scratchDirs: [`${HOME}/.cache`, `${HOME}/.config/opencode`],
    image: "opencode",
    notes:
      "Model ids are `provider/model`; the API key follows the provider prefix (anthropic, openai, google). `ollama/…` and `lmstudio/…` reach the host's local server and need no key.",
  },
  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    protocol: "acp",
    authKinds: ["api-key"],
    defaultAuth: "api-key",
    models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
    defaultModel: "gemini-3.8-flash",
    freeFormModels: true,
    effortLevels: [],
    economyModels: { "*": "gemini-3.5-flash-lite" },
    guarantees: ACP_GUARANTEES,
    stateDir: `${HOME}/.gemini`,
    scratchDirs: [`${HOME}/.cache`],
    image: "gemini-cli",
    notes: "Needs a Gemini API key (Google AI Studio); the browser login cannot run headless.",
  },
  codex: {
    id: "codex",
    name: "Codex",
    protocol: "acp",
    authKinds: ["api-key"],
    defaultAuth: "api-key",
    models: [{ id: "default", label: "Codex default model" }],
    defaultModel: "default",
    freeFormModels: true,
    effortLevels: ["low", "medium", "high", "xhigh"],
    economyModels: {},
    guarantees: ACP_GUARANTEES,
    stateDir: `${HOME}/.codex`,
    scratchDirs: [`${HOME}/.cache`],
    image: "codex",
    notes:
      "Runs through codex-acp with an OpenAI API key; supports a model ID and reasoning effort through Codex configuration. Use default to retain the provider default.",
  },
};

const OPENCODE_PREFIX_KEYS: Readonly<Record<string, SecretKeyName>> = {
  anthropic: "anthropic-api-key",
  openai: "openai-api-key",
  google: "gemini-api-key",
};

export function secretKeysFor(
  provider: ProviderId,
  auth: AuthKind,
  model: string,
): SecretKeyName[] {
  if (auth === "none") {
    return [];
  }
  if (provider === "claude-code") {
    return [auth === "subscription" ? "anthropic-oauth-token" : "anthropic-api-key"];
  }
  if (provider === "gemini-cli") {
    return ["gemini-api-key"];
  }
  if (provider === "codex") {
    return ["openai-api-key"];
  }
  const key = OPENCODE_PREFIX_KEYS[model.split("/")[0] ?? ""];
  return key === undefined ? [] : [key];
}

export type SecretSource = { kind: "command"; value: string } | { kind: "url"; value: string };

export const SECRET_SOURCE: Readonly<Record<SecretKeyName, SecretSource>> = {
  "anthropic-oauth-token": { kind: "command", value: "claude setup-token" },
  "anthropic-api-key": { kind: "url", value: "https://console.anthropic.com/settings/keys" },
  "openai-api-key": { kind: "url", value: "https://platform.openai.com/api-keys" },
  "gemini-api-key": { kind: "url", value: "https://aistudio.google.com/api-keys" },
  "github-token": { kind: "command", value: "gh auth token" },
};

export const SECRET_ENV: Readonly<Record<SecretKeyName, string | null>> = {
  "anthropic-oauth-token": "CLAUDE_CODE_OAUTH_TOKEN",
  "anthropic-api-key": "ANTHROPIC_API_KEY",
  "openai-api-key": "OPENAI_API_KEY",
  "gemini-api-key": "GEMINI_API_KEY",
  "github-token": null,
};

export function imageRefFor(base: string, variant: ProviderId): string {
  if (variant === "claude-code") {
    return base;
  }
  const colon = base.lastIndexOf(":");
  const slash = base.lastIndexOf("/");
  return colon > slash
    ? `${base.slice(0, colon)}-${variant}${base.slice(colon)}`
    : `${base}-${variant}`;
}

export const economyModelFor = (provider: ProviderId, model: string): string | null => {
  const table = PROVIDERS[provider].economyModels;
  const slash = model.indexOf("/");
  const economy = table[slash === -1 ? "*" : model.slice(0, slash)] ?? table["*"];
  return economy === undefined || economy === model ? null : economy;
};
