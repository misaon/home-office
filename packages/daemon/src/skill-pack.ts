import type { Agent, ProviderId, SessionMode } from "@ho/protocol";

const MODE_PACK: Readonly<Record<SessionMode, string | null>> = {
  work: "work",
  review: "review",
  triage: null,
  plan: null,
  verify: "verify",
};

const OFFICE_PACK = "office";

export type RepositoryLanguage = "typescript" | "python" | "php" | "java";

const LANGUAGE_PACK: Readonly<Partial<Record<RepositoryLanguage, string>>> = { java: "java" };

export const skillPacksFor = (
  agent: Agent,
  mode: SessionMode,
  languages: readonly RepositoryLanguage[],
): string[] => {
  const modePack = MODE_PACK[mode];
  const languagePacks =
    modePack === null ? [] : languages.map((language) => LANGUAGE_PACK[language] ?? null);
  const packs = [OFFICE_PACK, modePack, ...languagePacks, agent.skillPack].filter(
    (pack): pack is string => pack !== null && pack !== "none",
  );
  return [...new Set(packs)];
};

const REPOSITORY_LANGUAGES: readonly RepositoryLanguage[] = ["typescript", "python", "php", "java"];

export const LANGUAGE_MARKERS: Readonly<Record<RepositoryLanguage, readonly string[]>> = {
  typescript: ["tsconfig.json", "jsconfig.json", "package.json"],
  python: ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"],
  php: ["composer.json"],
  java: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
};

const basenameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export const languagesOf = (files: readonly string[]): RepositoryLanguage[] => {
  const names = new Set(files.map((file) => basenameOf(file)));
  return REPOSITORY_LANGUAGES.filter((language) =>
    LANGUAGE_MARKERS[language].some((marker) => names.has(marker)),
  );
};

export const lspPluginsFor = (
  provider: ProviderId,
  languages: readonly RepositoryLanguage[],
): RepositoryLanguage[] => (provider === "claude-code" ? [...languages] : []);
