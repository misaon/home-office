import { Popover } from "@base-ui/react/popover";
import type { PlanUsageStatus } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ChartNoAxesColumn, Gauge, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { planUsageQuery } from "../queries.ts";
import { UsageMenu, useContextFill } from "./chat-usage-menu.tsx";
import type { Floor, ThreadPick } from "./data.ts";
import { formatShare, type PlanShare, useThreadPlanShare } from "./live-plan.ts";
import { MONO } from "./tokens.ts";

const planLabel = (status: PlanUsageStatus, share: PlanShare | null): string => {
  if (status.kind !== "ok") {
    return status.kind === "sign_in" ? "!" : "?";
  }
  return share === null ? "—" : `${formatShare(share.percent)} %`;
};

const SQUARE =
  "w-28 h-28 grid place-items-center border border-border-strong rounded-8 py-1 px-6 cursor-pointer transition-all duration-250 bg-transparent text-ink-quiet";

const METER =
  "flex items-center gap-7 h-28 py-0 px-10 border border-border-strong rounded-8 cursor-pointer transition-all duration-200";

const SEND =
  "w-32 h-32 flex-[0_0_32px] grid place-items-center border-0 rounded-10 py-1 px-6 bg-accent text-accent-ink cursor-pointer transition-all duration-220 ease-soft";

export function ChatToolbar({
  floor,
  active,
  onSend,
  onAttach,
}: {
  floor: Floor;
  active: ThreadPick | "new";
  onSend: () => void;
  onAttach: (file: File) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [usageOpen, setUsageOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const fill = useContextFill(floor.id);
  const plan = useQuery(planUsageQuery);
  const share = useThreadPlanShare(floor.id, active, plan.data);
  const planTitle =
    plan.data === undefined || plan.data.kind === "off"
      ? ""
      : plan.data.kind === "sign_in"
        ? t("usage.planSignIn")
        : plan.data.kind === "unavailable"
          ? t("usage.planUnavailable", { message: plan.data.message })
          : share === null
            ? t("usage.planNoTask", { five: Math.round(plan.data.usage.fiveHour?.percent ?? 0) })
            : t("usage.planShareTitle", {
                title: share.title,
                percent: formatShare(share.percent),
                five: Math.round(plan.data.usage.fiveHour?.percent ?? 0),
              });

  return (
    <div className="flex items-center gap-8">
      <input
        ref={file}
        type="file"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen !== undefined) {
            onAttach(chosen);
          }
        }}
      />
      <button
        type="button"
        aria-label={t("chat.attach")}
        title={t("chat.attach")}
        onClick={() => {
          file.current?.click();
        }}
        className={`hover:text-accent-soft hover:border-accent-a45 hover:rotate-90 ${SQUARE}`}
      >
        <Plus size={12} strokeWidth={1.5} />
      </button>
      <div className="flex-1" />
      <Popover.Root open={usageOpen} onOpenChange={setUsageOpen}>
        <Popover.Trigger
          title={t("usage.chipTitle")}
          className={`hover:text-accent-soft hover:border-accent-a45 flex-[0_0_auto] ${METER} ${usageOpen ? "bg-accent-a14" : "bg-transparent"} ${usageOpen ? "text-accent-soft" : "text-ink-quiet"}`}
        >
          <ChartNoAxesColumn size={12} strokeWidth={1.5} />
          <span className={`${MONO} text-10h`}>
            {fill === null ? "—" : `${String(Math.max(1, Math.round(fill * 100)))}%`}
          </span>
        </Popover.Trigger>
        <UsageMenu
          floorId={floor.id}
          onOpenFull={() => {
            setUsageOpen(false);
          }}
        />
      </Popover.Root>
      {plan.data === undefined || plan.data.kind === "off" ? null : (
        <span
          title={planTitle}
          className={`${METER} cursor-default ${share?.running === true ? "text-accent-soft" : "text-ink-quiet"}`}
        >
          <Gauge size={12} strokeWidth={1.5} />
          <span className={`${MONO} text-10h`}>{planLabel(plan.data, share)}</span>
        </span>
      )}
      <button
        type="button"
        aria-label={t("chat.sendHint")}
        title={t("chat.sendHint")}
        onClick={onSend}
        className={`hover:-translate-y-2 hover:scale-106 hover:shadow-lift-md ${SEND}`}
      >
        <ArrowUp size={13} strokeWidth={1.8} />
      </button>
    </div>
  );
}
