import type { Doctor } from "@ho/protocol";
import { useEffect, useState } from "react";
import { getClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { dockerStatus, imagesStatus, setupNeeded, teamStatus, tokenStatus } from "./status.ts";
import { DockerStep, ImagesStep, TokenStep } from "./steps-environment.tsx";
import { ProjectStep, SmokeStep, TeamStep } from "./steps-office.tsx";

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

const fetchDoctor = (): Promise<Doctor | null> =>
  getClient()
    ?.system.doctor()
    .catch(() => null) ?? Promise.resolve(null);

/**
 * Opens the checklist once per connection when the office cannot work yet (no Docker, no images, no
 * token or no boss) unless the user dismissed it before; the header's "Setup" button reopens it.
 */
export function useSetupAutoOpen(): void {
  const connection = useUi((s) => s.connection);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  useEffect(() => {
    if (connection !== "online" || dismissed()) {
      return undefined;
    }
    let cancelled = false;
    void fetchDoctor().then((doctor) => {
      if (!cancelled && doctor !== null && setupNeeded(doctor, useUi.getState().snapshot)) {
        setSetupOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [connection, setSetupOpen]);
}

export function SetupOverlay(): React.JSX.Element | null {
  const open = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const snapshot = useUi((s) => s.snapshot);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = (): void => {
    setTick((n) => n + 1);
  };
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let cancelled = false;
    void fetchDoctor().then((d) => {
      if (!cancelled) {
        setDoctor(d);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tick]);
  if (!open) {
    return null;
  }
  const ready = [
    dockerStatus(doctor),
    imagesStatus(doctor),
    tokenStatus(doctor),
    teamStatus(snapshot),
  ].every((s) => s.state === "ok");
  const close = (): void => {
    dismiss();
    setSetupOpen(false);
  };
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/80 p-6 text-xs">
      <div className="w-full max-w-2xl space-y-2">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Set up your office</h2>
            <p className="text-gray-400">
              Four things make the office work; the last two are the first hires and a hello.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded bg-line px-2 py-1" onClick={refresh}>
              Re-check
            </button>
            <button type="button" className="rounded bg-line px-2 py-1" onClick={close}>
              {ready ? "Close" : "Skip for now"}
            </button>
          </div>
        </header>
        <DockerStep doctor={doctor} refresh={refresh} />
        <ImagesStep doctor={doctor} refresh={refresh} />
        <TokenStep doctor={doctor} refresh={refresh} />
        <TeamStep snapshot={snapshot} />
        <ProjectStep snapshot={snapshot} />
        <SmokeStep snapshot={snapshot} ready={ready} />
      </div>
    </div>
  );
}
