// The office's own language. English is the default and the fallback; the choice is this viewer's, so
// it lives in localStorage next to the dismissed setup checklist rather than in the daemon's config.
// Agent briefs, prompts and the CLI stay English whatever is chosen here.
// `use` is aliased: a bare `use(...)` reads as a React hook to the linter, and is not one.
import { changeLanguage, init, use as registerPlugin } from "i18next";
import { initReactI18next } from "react-i18next";
import { cs } from "./cs.ts";
import { en } from "./en.ts";

export const LANGUAGES = ["en", "cs"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "ho.language";
const isLanguage = (value: string | null): value is Language =>
  value !== null && LANGUAGES.some((language) => language === value);

export const storedLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : "en";
  } catch {
    // A browser that refuses storage still gets an office, in English.
    return "en";
  }
};

export const setLanguage = async (language: Language): Promise<void> => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not worth failing the switch over: the choice simply does not survive a reload.
  }
  await changeLanguage(language);
};

export const startI18n = async (): Promise<void> => {
  registerPlugin(initReactI18next);
  await init({
    resources: { en: { translation: en }, cs: { translation: cs } },
    lng: storedLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
};

declare module "i18next" {
  // Typed keys, and `cs` is checked against `en` by its own annotation: a missing translation is a
  // type error, and so is a key that no longer exists. `interface` is not a choice here — augmenting
  // a library's own interface is the only way to reach i18next's type options.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
