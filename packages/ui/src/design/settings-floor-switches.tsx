import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useDesign } from "./store.ts";

const TRACK: React.CSSProperties = {
  flex: "0 0 38px",
  width: "38px",
  height: "22px",
  borderRadius: "99px",
  border: "0",
  cursor: "pointer",
  padding: "3px",
  display: "flex",
  transition: "background .3s",
};

const KNOB: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  transition: "transform .34s cubic-bezier(.34,1.5,.5,1)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  gap: "11px",
  alignItems: "flex-start",
  marginBottom: "14px",
};

/** A switch drawn the way the design draws one, with its consequence written beside it. */
function Switch({
  on,
  title,
  hint,
  onFlip,
}: {
  on: boolean;
  title: string;
  hint: string;
  onFlip: () => void;
}): React.JSX.Element {
  return (
    <div style={ROW}>
      <button
        type="button"
        aria-label={title}
        aria-pressed={on}
        onClick={onFlip}
        style={{ ...TRACK, background: on ? "var(--a,#FFC531)" : "#2C2C32" }}
      >
        <span
          style={{
            ...KNOB,
            background: on ? "#150F02" : "#8E8B85",
            transform: `translateX(${on ? "16px" : "0px"})`,
          }}
        />
      </button>
      <div>
        <div style={{ fontSize: "13px" }}>{title}</div>
        <div style={{ fontSize: "11.5px", color: "#A6A39C", lineHeight: "1.6", marginTop: "4px" }}>
          {hint}
        </div>
      </div>
    </div>
  );
}

/** The three things a floor decides for itself: how work leaves it, what feeds it, what it may start. */
export function FloorSwitches({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const update = useMutation({
    mutationFn: (patch: {
      publish?: { mode: "branch" | "pull-request" };
      intake?: { enabled: boolean };
      services?: { enabled: boolean };
    }) => requireClient().projects.update({ id: floor.id, patch }),
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  return (
    <>
      <Switch
        on={floor.pr}
        title={t("project.pullRequests")}
        hint={t("project.pullRequestsHint")}
        onFlip={() => {
          update.mutate({ publish: { mode: floor.pr ? "branch" : "pull-request" } });
        }}
      />
      <Switch
        on={floor.issues}
        title={t("settings.intake")}
        hint={t("settings.intakeHint")}
        onFlip={() => {
          update.mutate({ intake: { enabled: !floor.issues } });
        }}
      />
      <Switch
        on={floor.services}
        title={t("settings.servicesLabel")}
        hint={t("settings.servicesHint")}
        onFlip={() => {
          update.mutate({ services: { enabled: !floor.services } });
        }}
      />
    </>
  );
}
