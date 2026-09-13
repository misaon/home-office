import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../kit/controls.tsx";
import { doctorQuery } from "../queries.ts";
import { useOnline, useUi } from "../store.ts";
import { setupNeeded, setupReady } from "./status.ts";
import { DockerStep, ImagesStep, TokenStep } from "./steps-environment.tsx";
import { SmokeStep } from "./steps-office.tsx";

const DISMISSED_KEY = "ho.setup.dismissed";

const dismissed = (): boolean => {
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
 * Opens the checklist once per connection when the office cannot work yet (no Docker, no images or no
 * token) unless the user dismissed it before; the header's "Setup" button reopens it. Floors and their
 * teams are not part of it: the empty office offers the first project itself.
 */
export function useSetupAutoOpen(): void {
  const online = useOnline();
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const { data: doctor } = useQuery({ ...doctorQuery, enabled: online && !dismissed() });
  useEffect(() => {
    if (online && !dismissed() && doctor !== undefined && setupNeeded(doctor)) {
      setSetupOpen(true);
    }
  }, [online, doctor, setSetupOpen]);
}

export function SetupOverlay(): React.JSX.Element | null {
  const { t } = useTranslation();
  const open = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const floorId = useUi((s) => s.floorId);
  const online = useOnline();
  const query = useQuery({ ...doctorQuery, enabled: open && online });
  const doctor = query.data ?? null;
  const refresh = (): void => {
    void query.refetch();
  };
  if (!open) {
    return null;
  }
  const ready = setupReady(doctor);
  const close = (): void => {
    dismiss();
    setSetupOpen(false);
  };
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/85 p-8 text-xs">
      <div className="w-full max-w-2xl space-y-4">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold">{t("setup.title")}</h2>
            <p className="mt-2 leading-relaxed text-gray-400">{t("setup.intro")}</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Button onClick={refresh}>{t("setup.recheck")}</Button>
            <Button onClick={close}>{ready ? t("common.close") : t("setup.skip")}</Button>
          </div>
        </header>
        <DockerStep doctor={doctor} refresh={refresh} />
        <ImagesStep doctor={doctor} refresh={refresh} />
        <TokenStep doctor={doctor} />
        <SmokeStep key={floorId} ready={ready} />
      </div>
    </div>
  );
}
