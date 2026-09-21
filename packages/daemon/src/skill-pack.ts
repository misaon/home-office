import type { Agent, ProviderId, SessionMode } from "@ho/protocol";

const MODE_PACK: Readonly<Record<SessionMode, string | null>> = {
  work: "work",
  review: "review",
  triage: null,
  plan: null,
  verify: "verify",
};

export const skillPacksFor = (agent: Agent, mode: SessionMode): string[] => {
  const packs = [MODE_PACK[mode], agent.skillPack].filter(
    (pack): pack is string => pack !== null && pack !== "none",
  );
  return [...new Set(packs)];
};

export type LspLanguage = "typescript" | "python" | "php";

const LSP_LANGUAGES: readonly LspLanguage[] = ["typescript", "python", "php"];

export const LSP_MARKERS: Readonly<Record<LspLanguage, readonly string[]>> = {
  typescript: ["tsconfig.json", "jsconfig.json", "package.json"],
  python: ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"],
  php: ["composer.json"],
};

export const languagesOf = (rootFiles: readonly string[]): LspLanguage[] =>
  LSP_LANGUAGES.filter((language) =>
    LSP_MARKERS[language].some((marker) => rootFiles.includes(marker)),
  );

export const lspPacksFor = (provider: ProviderId, languages: readonly LspLanguage[]): string[] =>
  provider === "claude-code" ? languages.map((language) => `lsp-${language}`) : [];
