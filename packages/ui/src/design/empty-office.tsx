import { useTranslation } from "react-i18next";
import { House, Plus } from "lucide-react";
import { DISPLAY, MONO } from "./tokens.ts";
import { useUi } from "../store.ts";

const STEPS = ["1", "2", "3"] as const;

const CARD = "flex-[1_1_150px] min-w-150 p-14 rounded-14 bg-card border border-edge";

const PRIMARY =
  "flex items-center gap-9 py-13 px-22 rounded-13 border-0 bg-accent text-accent-ink text-13h font-semibold cursor-pointer transition-all duration-220 ease-soft";

const SECONDARY =
  "py-13 px-18 rounded-13 border border-border-strong bg-transparent text-13h text-ink-quiet cursor-pointer transition-all duration-200";

function EmptyMark(): React.JSX.Element {
  return (
    <div className="relative w-96 h-96 m-[0_auto_26px]">
      <div className="absolute inset-0 rounded-28 bg-accent grid place-items-center shadow-gold-far">
        <House size={42} strokeWidth={1.5} className="text-accent-ink" />
      </div>
      <div className="absolute -inset-10 rounded-36 border-[1.5px] border-accent-a45 animate-ring-3400" />
    </div>
  );
}

function EmptyActions(): React.JSX.Element {
  const { t } = useTranslation();
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  return (
    <div className="flex items-center justify-center gap-9 mt-26 flex-wrap">
      <button
        type="button"
        onClick={() => {
          setAddProjectOpen(true);
        }}
        className={`hover:-translate-y-2 hover:shadow-lift-2xl ${PRIMARY}`}
      >
        <Plus size={14} strokeWidth={1.8} />
        {t("app.emptyCreate")}
      </button>
      <button
        type="button"
        onClick={() => {
          setSetupOpen(true);
        }}
        className={`hover:text-ink hover:border-border-hover hover:bg-raised ${SECONDARY}`}
      >
        {t("app.emptySetup")}
      </button>
    </div>
  );
}

function EmptySteps(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex gap-10 mt-34 text-left flex-wrap justify-center">
      {STEPS.map((n) => (
        <div key={n} className={CARD}>
          <div
            className={`w-24 h-24 rounded-8 bg-accent-a14 text-accent-soft grid place-items-center ${MONO} text-11 mb-11`}
          >
            <span>{n}</span>
          </div>
          <div className="text-12h font-semibold text-ink-warm">{t(`app.emptyStep${n}Title`)}</div>
          <div className="text-11h text-ink-meta mt-5 leading-text">
            {t(`app.emptyStep${n}Body`)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyOffice(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <main className="flex-1 min-h-0 relative z-20 flex items-center justify-center p-32 bg-dots">
      <div className="w-[min(560px,100%)] text-center animate-pop-500">
        <EmptyMark />
        <div className={`${DISPLAY} font-bold text-32 tracking-display-tight leading-headline`}>
          {t("app.emptyTitle")}
        </div>
        <div className="text-13h text-ink-label mt-14 leading-read max-w-420 ml-auto mr-auto text-pretty">
          {t("app.emptyBody")}
        </div>
        <EmptyActions />
        <EmptySteps />
      </div>
    </main>
  );
}
