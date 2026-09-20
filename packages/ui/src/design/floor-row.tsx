import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { MONO } from "./tokens.ts";

const ROW =
  "w-full flex items-center gap-10 p-10 rounded-10 cursor-pointer text-left transition-all duration-200";

const BADGE = `w-22 h-22 flex-[0_0_22px] rounded-7 grid place-items-center ${MONO} text-10h`;

const NAME = `block ${MONO} text-12 overflow-hidden text-ellipsis whitespace-nowrap`;

const PILL = "flex items-center gap-6 pt-3 pr-8 pb-3 pl-7 rounded-pill flex-[0_0_auto]";

function busyOf(floor: Floor): {
  busy: boolean;
  working: number;
  blocked: number;
  mark: string;
  tone: string;
  ink: string;
} {
  const working = floor.team.filter((p) => p.status === "working").length;
  const running = floor.cards.filter((card) => card.lane === "running").length;
  const blocked = floor.cards.filter((card) => card.lane === "blocked").length;
  const busy = working > 0 || running > 0;
  return {
    busy,
    working: working > 0 ? working : running,
    blocked,
    mark: busy ? "bg-accent" : blocked > 0 ? "bg-bad" : "bg-ink-lane",
    tone: busy
      ? "bg-accent-a10 border-accent-a30"
      : blocked > 0
        ? "bg-bad-a10 border-bad-a28"
        : "bg-pill border-border-strong",
    ink: busy ? "text-accent-soft" : blocked > 0 ? "text-bad-soft" : "text-ink-meta",
  };
}

export function FloorRow({
  floor,
  index,
  current,
  onPick,
}: {
  floor: Floor;
  index: number;
  current: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const busy = busyOf(floor);
  const open = floor.cards.filter((card) => card.lane !== "done").length;

  return (
    <button
      type="button"
      aria-label={floor.name}
      onClick={onPick}
      className={`hover:bg-accent-a09 ${ROW} border ${current ? "border-accent-a25" : "border-transparent"} ${current ? "bg-accent-a08" : "bg-transparent"}`}
    >
      <span
        className={`${BADGE} ${current ? "bg-accent" : "bg-edge-lit"} ${current ? "text-accent-ink" : "text-ink-faint"}`}
      >
        <span>{index + 1}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className={`${NAME} ${current ? "text-accent-soft" : "text-ink-soft"}`}>
          {floor.name}
        </span>
        <span className="block text-10h text-ink-meta mt-3">
          {t("project.summary", { agents: floor.team.length, open })}
        </span>
      </span>
      <span className={`${PILL} border ${busy.tone}`}>
        <span className="relative w-5 h-5 inline-block">
          <span className={`absolute inset-0 rounded-half ${busy.mark}`} />
          {busy.busy ? (
            <span className={`absolute inset-0 rounded-half animate-ring-2200 ${busy.mark}`} />
          ) : null}
        </span>
        <span className={`${MONO} text-9h whitespace-nowrap ${busy.ink}`}>
          {busy.busy
            ? t("project.working", { count: busy.working })
            : busy.blocked > 0
              ? t("project.blocked", { count: busy.blocked })
              : t("project.quiet")}
        </span>
      </span>
    </button>
  );
}
