import type { RuntimeSessionSpec } from "@ho/core";
import type { ProviderId } from "@ho/protocol";

export type AcpPreset = {
  id: ProviderId;
  name: string;
  argv: (spec: RuntimeSessionSpec) => string[];
  env: (spec: RuntimeSessionSpec) => Record<string, string>;
  authMethods: readonly string[];
};

const LOCAL_PROVIDERS: Readonly<Record<string, { name: string; baseURL: string }>> = {
  ollama: { name: "Ollama", baseURL: "http://host.docker.internal:11434/v1" },
  lmstudio: { name: "LM Studio", baseURL: "http://host.docker.internal:1234/v1" },
};

const providerBlock = (model: string): Record<string, unknown> => {
  const slash = model.indexOf("/");
  const prefix = slash === -1 ? "" : model.slice(0, slash);
  const local = LOCAL_PROVIDERS[prefix];
  if (local === undefined) {
    return {};
  }
  const id = model.slice(slash + 1);
  return {
    provider: {
      [prefix]: {
        npm: "@ai-sdk/openai-compatible",
        name: local.name,
        options: { baseURL: local.baseURL },
        models: { [id]: { name: id } },
      },
    },
  };
};

export const opencodePreset = (): AcpPreset => ({
  id: "opencode",
  name: "OpenCode",
  argv: (spec) => ["opencode", "acp", "--cwd", spec.cwd],
  env: (spec) => ({
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      model: spec.model,
      permission: { edit: spec.allowWrites ? "allow" : "deny", bash: "allow", webfetch: "allow" },
      autoupdate: false,
      share: "disabled",
      ...providerBlock(spec.model),
    }),
  }),
  authMethods: ["api", "apikey", "api-key"],
});

export const geminiPreset = (): AcpPreset => ({
  id: "gemini-cli",
  name: "Gemini CLI",
  argv: (spec) => ["gemini", "--acp", "--model", spec.model, "--approval-mode", "yolo"],
  env: () => ({ GEMINI_CLI_NO_RELAUNCH: "true" }),
  authMethods: ["gemini-api-key", "api-key", "api"],
});

export const codexPreset = (): AcpPreset => ({
  id: "codex",
  name: "Codex",
  argv: () => ["codex-acp"],
  env: (spec) => ({
    NO_BROWSER: "1",
    INITIAL_AGENT_MODE: "agent-full-access",
    CODEX_CONFIG: JSON.stringify({
      ...(spec.model === "default" ? {} : { model: spec.model }),
      model_reasoning_effort: spec.effort,
    }),
  }),
  authMethods: ["openai-api-key", "api-key", "api"],
});
