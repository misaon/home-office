import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "../kit/controls.tsx";
import { doctorQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { dockerStatus, imagesStatus, setupNeeded, tokenStatus } from "./status.ts";
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
  const connection = useUi((s) => s.connection);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const { data: doctor } = useQuery({
    ...doctorQuery,
    enabled: connection === "online" && !dismissed(),
  });
  useEffect(() => {
    if (connection === "online" && !dismissed() && doctor !== undefined && setupNeeded(doctor)) {
      setSetupOpen(true);
    }
  }, [connection, doctor, setSetupOpen]);
}

export function SetupOverlay(): React.JSX.Element | null {
  const open = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  const connection = useUi((s) => s.connection);
  const query = useQuery({ ...doctorQuery, enabled: open && connection === "online" });
  const doctor = query.data ?? null;
  const refresh = (): void => {
    void query.refetch();
  };
  if (!open) {
    return null;
  }
  const ready = [dockerStatus(doctor), imagesStatus(doctor), tokenStatus(doctor)].every(
    (s) => s.state === "ok",
  );
  const close = (): void => {
    dismiss();
    setSetupOpen(false);
  };
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/85 p-8 text-xs">
      <div className="w-full max-w-2xl space-y-4">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold">Set up your office</h2>
            <p className="mt-2 leading-relaxed text-gray-400">
              Three things make the office work; the fourth is a hello to a floor’s boss.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Button onClick={refresh}>Re-check</Button>
            <Button onClick={close}>{ready ? "Close" : "Skip for now"}</Button>
          </div>
        </header>
        <DockerStep doctor={doctor} refresh={refresh} />
        <ImagesStep doctor={doctor} refresh={refresh} />
        <TokenStep doctor={doctor} refresh={refresh} />
        <SmokeStep key={floorId} snapshot={snapshot} ready={ready} />
      </div>
    </div>
  );
}
