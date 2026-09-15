import { HeaderBrand } from "./header-brand.tsx";
import { HeaderFloor } from "./header-floor.tsx";
import { HeaderTabs } from "./header-tabs.tsx";
import { useTranslation } from "react-i18next";
import { Connection } from "./connection.tsx";
import { useUi } from "../store.ts";
import { useDesign } from "./store.ts";

const BAR =
  "flex-[0_0_58px] h-58 flex items-center justify-between bg-header backdrop-blur-[20px] border-b border-line relative z-40";

const TOOL =
  "flex items-center gap-7 py-7 px-12 rounded-10 border border-border-strong bg-transparent cursor-pointer text-12h text-ink-quiet whitespace-nowrap flex-[0_0_auto] transition-all duration-200";

/** The office's own top bar: who you are looking at, and which of the five panels is open. */
export function Header({
  internal,
  hasFloors,
}: {
  internal: boolean;
  hasFloors: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const set = useDesign((s) => s.set);

  return (
    <header className={BAR}>
      <div className="flex items-center gap-13 pl-18 flex-[1_1_auto] min-w-0">
        <HeaderBrand />
        <Connection />
        {hasFloors ? <HeaderFloor /> : null}
      </div>
      <div className="flex items-stretch h-full flex-[0_0_auto]">
        <div className="flex items-center gap-7 pr-16 flex-[0_0_auto]">
          {internal ? (
            <button
              type="button"
              onClick={() => {
                set({ editor: true });
              }}
              className={`hover:text-ink hover:border-border-hover hover:bg-raised ${TOOL}`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <rect x="1.6" y="1.6" width="10.8" height="10.8" rx="2" />
                <line x1="1.6" y1="5.4" x2="12.4" y2="5.4" />
                <line x1="5.4" y1="5.4" x2="5.4" y2="12.4" />
              </svg>
              {t("app.editorButton")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSetupOpen(true);
            }}
            className={`hover:text-ink hover:border-border-hover hover:bg-raised ${TOOL}`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <circle cx="7" cy="7" r="2.4" />
              <circle cx="7" cy="7" r="5.4" />
            </svg>
            {t("app.setup")}
          </button>
        </div>
        {hasFloors ? <HeaderTabs /> : null}
      </div>
    </header>
  );
}
