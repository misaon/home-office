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
        <div className="flex gap-5 flex-[0_0_auto]">
          {LANGUAGES.map((code: Language) => {
            const tone = pill(i18n.language === code);
            return (
              <button
                type="button"
                key={code}
                onClick={() => {
                  void setLanguage(code).then(() => {
                    flash(t("settings.languageSet"));
                  });
                }}
                className={`py-6 px-13 rounded-pill cursor-pointer text-12 transition-all duration-220 hover:-translate-y-1 ${tone}`}
              >
                {t(`settings.lang.${code}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
