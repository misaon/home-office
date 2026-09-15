import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@ho/protocol";
import type { OfficeHandle } from "../office/scene.ts";
import { bossOf, useFloor } from "./live.ts";
import { useDesign } from "./store.ts";

const BAR =
  "absolute bottom-38 left-1/2 -translate-x-1/2 flex items-center gap-4 flex-nowrap p-6 rounded-14 bg-camera-bar backdrop-blur-[18px] border border-glint-a13 shadow-camera";

const ROUND =
  "w-30 h-30 grid place-items-center border-0 rounded-9 py-1 px-6 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

const WIDE =
  "py-0 px-12 h-30 border-0 rounded-9 cursor-pointer text-12 whitespace-nowrap transition-all duration-200";

/** A square icon button on the camera bar. */
function Round({
  label,
  plus,
  onClick,
}: {
  label: string;
  plus: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`hover:bg-accent-a16 hover:text-accent-soft hover:scale-108 ${ROUND}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        {plus ? <line x1="6" y1="2.5" x2="6" y2="9.5" /> : null}
        <line x1="2.5" y1="6" x2="9.5" y2="6" />
      </svg>
    </button>
  );
}

/** The camera keeps this colleague in the middle of the floor until it is let go. */
function FollowBoss({
  id,
  name,
  office,
}: {
  id: AgentId;
  name: string;
  office: OfficeHandle | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const [on, setOn] = useState(office?.following() === id);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setOn(next);
        office?.follow(next ? id : null);
        flash(next ? t("stage.following", { name }) : t("stage.released"));
      }}
      className={`${WIDE} ${on ? "bg-accent-a16" : "bg-transparent"} ${on ? "text-accent-soft" : "text-ink-quiet"}`}
    >
      {t("stage.follow", { name })}
    </button>
  );
}

/** The camera's own controls, floating over the floor: how close you are, and who you follow. */
export function StageCamera({
  internal,
  office,
}: {
  internal: boolean;
  office: OfficeHandle | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const floor = useFloor();
  const set = useDesign((s) => s.set);
  const [zoom, setZoom] = useState(100);
  const boss = floor === null ? undefined : bossOf(floor);

  // The camera also moves under the pointer and the wheel, so the read-out follows it rather than
  // only our own clicks.
  useEffect(() => {
    if (office === null) {
      return undefined;
    }
    const timer = setInterval(() => {
      setZoom(office.percent());
    }, 200);
    return () => {
      clearInterval(timer);
    };
  }, [office]);

  return (
    <div className={BAR}>
      <Round
        label={t("stage.zoomOut")}
        plus={false}
        onClick={() => {
          office?.zoomOut();
        }}
      />
      <div className="min-w-52 text-center font-mono text-11h text-ink-warm">
        <span>{zoom}</span>%
      </div>
      <Round
        label={t("stage.zoomIn")}
        plus
        onClick={() => {
          office?.zoomIn();
        }}
      />
      <div className="w-1 h-18 bg-glint-a13 my-0 mx-4" />
      <button
        type="button"
        onClick={() => {
          office?.fit();
        }}
        className={`hover:bg-accent-a16 hover:text-accent-soft ${WIDE} bg-transparent text-ink-quiet`}
      >
        {t("stage.fit")}
      </button>
      {boss === undefined ? null : <FollowBoss id={boss.id} name={boss.name} office={office} />}
      {internal ? (
        <button
          type="button"
          onClick={() => {
            set({ editor: true });
          }}
          className="hover:-translate-y-1 hover:shadow-lift-sm-plus py-0 px-14 h-30 border-0 rounded-9 bg-accent text-accent-ink cursor-pointer text-12 font-semibold whitespace-nowrap flex-[0_0_auto] transition-all duration-200"
        >
          {t("stage.editFloor")}
        </button>
      ) : null}
    </div>
  );
}
