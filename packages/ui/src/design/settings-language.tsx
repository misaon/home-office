import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Language } from "../i18n/index.ts";
import { pill } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** Which language the office speaks to you in; agents are briefed in English regardless. */
export function LanguageCard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const flash = useDesign((s) => s.flash);
  return (
    <div
      style={{
        borderRadius: "14px",
        background: "#101013",
        border: "1px solid #232328",
        overflow: "hidden",
        marginBottom: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "11px",
          padding: "13px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1", minWidth: "120px" }}>
          <div style={{ fontSize: "13px" }}>{t("settings.language")}</div>
          <div style={{ fontSize: "11px", color: "#A6A39C", marginTop: "4px", lineHeight: "1.5" }}>
            {t("settings.languageHint")}
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", flex: "0 0 auto" }}>
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
                style={{
                  padding: "6px 13px",
                  borderRadius: "99px",
                  cursor: "pointer",
                  fontSize: "12px",
                  transition: "all .22s",
                  border: `1px solid ${tone.bd}`,
                  background: tone.bg,
                  color: tone.fg,
                }}
                className="hop4"
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
