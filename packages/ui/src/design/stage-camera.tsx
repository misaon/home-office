import { Toggle } from "@base-ui/react/toggle";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OfficeHandle } from "../office/scene.ts";
import { useUi } from "../store.ts";
import type { Floor } from "./data.ts";
import { bossOf, useFloor } from "./live.ts";
import { useDesign } from "./store.ts";

const BAR =
  "absolute bottom-38 left-1/2 -translate-x-1/2 flex items-center gap-4 flex-nowrap p-6 rounded-14 bg-camera-bar backdrop-blur-[18px] border border-glint-a13 shadow-camera";

const ROUND =
  "w-30 h-30 grid place-items-center border-0 rounded-9 py-1 px-6 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

const WIDE =
  "py-0 px-12 h-30 border-0 rounded-9 cursor-pointer text-12 whitespace-nowrap transition-all duration-200";

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
      {plus ? <Plus size={12} strokeWidth={1.6} /> : <Minus size={12} strokeWidth={1.6} />}
    </button>
  );
}

function FollowAgent({
  floor,
  office,
}: {
  floor: Floor;
  office: OfficeHandle | null;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const followAgentId = useUi((s) => s.followAgentId);
  const target = floor.team.find((member) => member.id === followAgentId) ?? bossOf(floor);
  if (target === undefined) {
    return null;
  }
  return (
    <Toggle
      pressed={followAgentId !== null}
      onPressedChange={(next) => {
        office?.follow(next ? target.id : null);
        flash(next ? t("stage.following", { name: target.name }) : t("stage.released"));
      }}
      className={`${WIDE} bg-transparent text-ink-quiet data-pressed:bg-accent-a16 data-pressed:text-accent-soft`}
    >
      {t("stage.follow", { name: target.name })}
    </Toggle>
  );
}

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
      {floor === null ? null : <FollowAgent floor={floor} office={office} />}
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
