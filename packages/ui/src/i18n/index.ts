import { changeLanguage, init, use as registerPlugin } from "i18next";
import { initReactI18next } from "react-i18next";
import { cs } from "./cs.ts";
import { en } from "./en.ts";

export const LANGUAGES = ["en", "cs"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "ho.language";
const isLanguage = (value: string | null): value is Language =>
  value !== null && LANGUAGES.some((language) => language === value);

const storedLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : "en";
  } catch {
    return "en";
  }
};

export const setLanguage = async (language: Language): Promise<void> => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {}
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
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
