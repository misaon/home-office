import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { doctorQuery } from "../queries.ts";
import { setupNeeded, setupReady } from "../setup/status.ts";
import { DockerStep, ImagesStep, TokenStep } from "../setup/steps-environment.tsx";
import { SmokeStep } from "../setup/steps-office.tsx";
import { useOnline, useUi } from "../store.ts";
import { Button } from "./controls.tsx";
import { DISPLAY } from "./tokens.ts";

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

const CENTRE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
};

const SHEET: React.CSSProperties = {
  width: "min(680px,100%)",
  maxHeight: "100%",
  overflowY: "auto",
  borderRadius: "22px",
  background: "#0D0D10",
  border: "1px solid #2A2A32",
  boxShadow: "0 50px 120px rgba(0,0,0,.7)",
  animation: "popIn .46s cubic-bezier(.2,.9,.3,1.05) both",
};

const HEAD: React.CSSProperties = {
  padding: "24px 26px 20px",
  borderBottom: "1px solid #1B1B1F",
  display: "flex",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
};

/** The four things a working office needs, each one able to say how it is doing. */
export function Setup(): React.JSX.Element {
  const { t } = useTranslation();
  const open = useUi((s) => s.setupOpen);
  const setSetupOpen = useUi((s) => s.setSetupOpen);
  const floorId = useUi((s) => s.floorId);
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
    } else {
      element?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="ho-dialog"
      aria-label={t("setup.title")}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div style={CENTRE}>
        <div style={SHEET}>
          <div style={HEAD}>
            <div style={{ flex: "1", minWidth: "200px" }}>
              <div
                style={{ ...DISPLAY, fontWeight: "700", fontSize: "21px", letterSpacing: "-.01em" }}
              >
                {t("setup.title")}
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#ABA8A1",
                  marginTop: "6px",
                  lineHeight: "1.6",
                }}
              >
                {t("setup.intro")}
              </div>
            </div>
            <div style={{ display: "flex", gap: "7px" }}>
              <Button onClick={refresh} disabled={query.isFetching}>
                {t("setup.recheck")}
              </Button>
              <Button onClick={close}>{ready ? t("common.close") : t("setup.skip")}</Button>
            </div>
          </div>
          <div style={{ padding: "8px 26px 26px" }}>
            <DockerStep doctor={doctor} refresh={refresh} />
            <ImagesStep doctor={doctor} refresh={refresh} />
            <TokenStep doctor={doctor} />
            <SmokeStep key={floorId} ready={ready} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
