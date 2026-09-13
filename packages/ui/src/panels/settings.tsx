import { useTranslation } from "react-i18next";
import { LanguageSettings } from "./settings-language.tsx";
import { ProjectsSettings } from "./settings-projects.tsx";
import { TokenSettings } from "./settings-token.tsx";

/**
 * The office itself, in the order a reader needs it: how it speaks, what it signs in with, and what each
 * floor is connected to. The floor's people are in Team, next door, where their live state also lives.
 */
export function SettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="h-full space-y-7 overflow-y-auto p-4 text-xs">
      <p className="text-2xs leading-relaxed text-faint">{t("settings.intro")}</p>
      <LanguageSettings />
      <TokenSettings />
      <ProjectsSettings />
    </div>
  );
}
