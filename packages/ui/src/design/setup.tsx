import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { doctorQuery } from "../queries.ts";
import { setupNeeded, setupReady } from "../setup/status.ts";
import { DockerStep, ImagesStep, TokenStep } from "../setup/steps-environment.tsx";
import { useOnline, useUi } from "../store.ts";
import { DISPLAY } from "./tokens.ts";
import { CENTRE, outside } from "./dialog-sheet.tsx";

const DISMISSED_KEY = "ho.setup.dismissed";

const setupDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

const dismiss = (): void => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage may be unavailable; the checklist simply reappears next time.
  }
};

/**
 * Opens the checklist once per connection when the office cannot work yet, unless it was dismissed
 * before; the header's Setup button reopens it either way.
 */
export function useSetupAutoOpen(): void {
  const online = useOnline();
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const { data: doctor } = useQuery({ ...doctorQuery, enabled: online && !setupDismissed() });
  useEffect(() => {
    if (online && !setupDismissed() && doctor !== undefined && setupNeeded(doctor)) {
      setSetupOpen(true);
    }
  }, [online, doctor, setSetupOpen]);
}

/** The checklist's own two header buttons, a size smaller than the ones the steps carry. */
const QUIET =
  "py-8 px-13 rounded-10 border border-border-strong bg-transparent text-12 text-ink-quiet cursor-pointer whitespace-nowrap transition-all duration-200";

const SHEET =
  "w-[min(680px,100%)] max-h-full overflow-y-auto rounded-22 bg-dialog border border-border-sheet shadow-setup animate-pop-460";

const HEAD = "pt-24 px-26 pb-20 border-b border-line flex items-start gap-16 flex-wrap";

/** The three things a working office needs, each one able to say how it is doing. */
export function Setup(): React.JSX.Element {
  const { t } = useTranslation();
  const open = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const online = useOnline();
  const query = useQuery({ ...doctorQuery, enabled: open && online });
  const doctor = query.data ?? null;
  const ready = setupReady(doctor);
  const refresh = (): void => {
    void query.refetch();
  };
  const close = (): void => {
    dismiss();
    setSetupOpen(false);
  };

  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      element?.showModal();
      // showModal() hands focus to the first focusable thing, which is the scrolling sheet: a scroll
      // container Chrome rings in blue. The dialog itself takes it instead, and wears no ring.
      element?.focus();
    } else {
      element?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="border-0 p-0 m-0 max-w-none max-h-none w-full h-full bg-transparent text-inherit overflow-hidden outline-none focus:outline-none focus-visible:outline-none backdrop:bg-scrim-a74 backdrop:backdrop-blur-[10px] backdrop:animate-fade-280"
      aria-label={t("setup.title")}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div role="presentation" className={CENTRE} onClick={outside(close)}>
        <div className={SHEET}>
          <div className={HEAD}>
            <div className="flex-1 min-w-200">
              <div className={`${DISPLAY} font-bold text-21 tracking-tight`}>
                {t("setup.title")}
              </div>
              <div className="text-12h text-ink-label mt-6 leading-prose">{t("setup.intro")}</div>
            </div>
            <div className="flex gap-7">
              <button
                type="button"
                onClick={refresh}
                disabled={query.isFetching}
                className={`hover:text-ink hover:border-border-hover hover:bg-raised ${QUIET}`}
              >
                {t("setup.recheck")}
              </button>
              <button
                type="button"
                onClick={close}
                className={`hover:text-ink hover:border-border-hover hover:bg-raised ${QUIET}`}
              >
                {ready ? t("common.close") : t("setup.skip")}
              </button>
            </div>
          </div>
          <div className="pt-8 px-26 pb-26">
            <DockerStep doctor={doctor} refresh={refresh} />
            <ImagesStep doctor={doctor} refresh={refresh} />
            <TokenStep doctor={doctor} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
