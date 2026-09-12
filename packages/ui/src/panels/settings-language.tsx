import { useTranslation } from "react-i18next";
import { Section, Segmented } from "../kit/controls.tsx";
import { type Language, LANGUAGES, setLanguage, storedLanguage } from "../i18n/index.ts";

const LABEL: Record<Language, string> = { en: "English", cs: "Čeština" };
const OPTIONS = LANGUAGES.map((value) => ({ value, label: LABEL[value] }));

/**
 * The office's own language, remembered in this browser. A language name is written in that language,
 * so these two labels are deliberately not translated.
 */
export function LanguageSettings(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((language) => language === i18n.language) ?? storedLanguage();
  return (
    <Section title={t("settings.language")}>
      <div className="space-y-2 rounded-md border border-line bg-panel p-3 text-xs">
        <Segmented
          value={current}
          options={OPTIONS}
          onChange={(language) => {
            void setLanguage(language);
          }}
        />
        <p className="text-gray-400">{t("settings.languageHint")}</p>
      </div>
    </Section>
  );
}
