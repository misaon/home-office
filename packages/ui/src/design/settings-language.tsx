import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Language } from "../i18n/index.ts";
import { pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** Which language the office speaks to you in; agents are briefed in English regardless. */
export function LanguageCard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const flash = useDesign((s) => s.flash);
  return (
    <div className="rounded-14 bg-card border border-edge overflow-hidden mb-18">
      <div className="flex items-center gap-11 p-13 flex-wrap">
        <div className="flex-1 min-w-120">
          <div className="text-13">{t("settings.language")}</div>
          <div className="text-11 text-ink-meta mt-4 leading-body">
            {t("settings.languageHint")}
          </div>
        </div>
        <ToggleGroup
          aria-label={t("settings.language")}
          value={[i18n.language]}
          onValueChange={(next) => {
            const picked = LANGUAGES.find((code: Language) => code === next.at(-1));
            if (picked !== undefined) {
              void setLanguage(picked).then(() => {
                flash(t("settings.languageSet"));
              });
            }
          }}
          className="flex gap-5 flex-[0_0_auto]"
        >
          {LANGUAGES.map((code: Language) => (
            <Toggle
              key={code}
              value={code}
              className={`py-6 px-13 rounded-pill cursor-pointer text-12 transition-all duration-220 hover:-translate-y-1 ${pill(i18n.language === code)}`}
            >
              {t(`settings.lang.${code}`)}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
