import type { RuntimeSessionSpec } from "@ho/core";
import type { ProviderId } from "@ho/protocol";

/** How one ACP-speaking CLI is started inside the sandbox and which auth method it should be offered. */
export type AcpPreset = {
  id: ProviderId;
  /** Human name for log lines and errors. */
  name: string;
  argv: (spec: RuntimeSessionSpec) => string[];
  /** Non-secret environment for the agent process (secrets are merged by the runtime). */
  env: (spec: RuntimeSessionSpec) => Record<string, string>;
  /** Preferred ACP `authMethods` ids, most preferred first; anything containing `api` also qualifies. */
  authMethods: readonly string[];
  /** Whether the CLI can restore a session (`session/load`) between office sessions. */
  resume: boolean;
};

/** Local model servers on the Mac, reached from the sandbox through Docker Desktop's host alias. */
const LOCAL_PROVIDERS: Readonly<Record<string, { name: string; baseURL: string }>> = {
  ollama: { name: "Ollama", baseURL: "http://host.docker.internal:11434/v1" },
  lmstudio: { name: "LM Studio", baseURL: "http://host.docker.internal:1234/v1" },
};

/** OpenCode's provider block for `ollama/<model>` and `lmstudio/<model>`; cloud providers need none. */
const providerBlock = (model: string): Record<string, unknown> => {
  const slash = model.indexOf("/");
  const prefix = slash < 0 ? "" : model.slice(0, slash);
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

/** OpenCode reads its whole configuration from `OPENCODE_CONFIG_CONTENT`; permissions are wide open because the sandbox is the boundary. */
export const opencodePreset = (): AcpPreset => ({
  id: "opencode",
  name: "OpenCode",
  argv: (spec) => ["opencode", "acp", "--cwd", spec.cwd],
  env: (spec) => ({
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      model: spec.model,
      permission: { edit: "allow", bash: "allow", webfetch: "allow" },
      autoupdate: false,
      share: "disabled",
      ...providerBlock(spec.model),
    }),
  }),
  authMethods: ["api", "apikey", "api-key"],
  resume: true,
});

/** Gemini CLI in ACP mode with every tool auto-approved; the key arrives as GEMINI_API_KEY. */
export const geminiPreset = (): AcpPreset => ({
  id: "gemini-cli",
  name: "Gemini CLI",
  argv: (spec) => ["gemini", "--acp", "--model", spec.model, "--approval-mode", "yolo"],
  env: () => ({ GEMINI_CLI_NO_RELAUNCH: "true" }),
  authMethods: ["gemini-api-key", "api-key", "api"],
  resume: true,
});

/** Codex through the codex-acp adapter; the model stays Codex's default (see the provider catalog). */
export const codexPreset = (): AcpPreset => ({
  id: "codex",
  name: "Codex",
  argv: () => ["codex-acp"],
  env: () => ({}),
  authMethods: ["openai-api-key", "api-key", "api"],
  resume: false,
});
