import { isSessionActive, type LiveEvent, type ProjectId } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usageQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { fmt, useDesign } from "./store.ts";

const POPOVER =
  "absolute bottom-38 right-0 w-284 p-14 rounded-14 bg-pop border border-border-strong shadow-lightbox z-40 animate-rise-pop-300";

const CAPS = "font-mono text-9h tracking-caps-wide uppercase text-ink-label";

const ROW = "flex items-center justify-between gap-9";

/** The last thing a running session said about how full its context window is. */
const contextOf = (events: readonly LiveEvent[] | undefined): number | null => {
  const last = events?.findLast((l) => l.event.kind === "context");
  return last === undefined || last.event.kind !== "context" || last.event.windowTokens === 0
    ? null
    : last.event.usedTokens / last.event.windowTokens;
};

/** How full the fullest running context window on this floor is, or null when nothing is running. */
export function useContextFill(floorId: ProjectId): number | null {
  const sessions = useUi((s) => s.snapshot.sessions);
  const tasks = useUi((s) => s.snapshot.tasks);
  const live = useUi((s) => s.live);
  const fills = [...sessions.values()]
    .filter((s) => isSessionActive(s.state) && tasks.get(s.taskId)?.projectId === floorId)
    .map((s) => contextOf(live.get(s.id)))
    .filter((fill): fill is number => fill !== null);
  return fills.length === 0 ? null : Math.max(...fills);
}

function Meter({
  name,
  value,
  pct,
  bar,
  fg,
}: {
  name: string;
  value: string;
  pct: string;
  bar: string;
  fg: string;
}): React.JSX.Element {
  return (
    <div className="mb-13">
      <div className={`${ROW} mb-7`}>
        <span className="text-12 text-ink-soft">{name}</span>
        <span className={`font-mono text-10h ${fg}`}>{value}</span>
      </div>
      <div className="h-4 rounded-pill bg-slot overflow-hidden">
        <div
          className={`h-full rounded-pill transition-[width] duration-500 ease-glide w-(--share) ${bar}`}
          style={{ "--share": pct }}
        />
      </div>
    </div>
  );
}

/**
 * What this floor is spending. The office reports what its own sessions told it and nothing more: no
 * provider hands out a plan's quota, so there is no percentage of one here.
 */
export function UsageMenu({ floorId }: { floorId: ProjectId }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const fill = useContextFill(floorId);
  const query = useQuery({ ...usageQuery(24), refetchInterval: 15_000 });
  const totals = query.data?.totals;
  const spent = totals === undefined ? 0 : totals.inputTokens + totals.outputTokens;

  return (
    <div className={POPOVER}>
      <div className={`${CAPS} mb-12`}>{t("usage.chipTitle")}</div>
      {fill === null ? (
        <div className="text-11h text-ink-meta mb-13">{t("usage.noRunning")}</div>
      ) : (
        <Meter
          name={t("usage.contextLabel")}
          value={t("usage.context", { percent: Math.round(fill * 100) })}
          pct={`${String(Math.max(1, Math.round(fill * 100)))}%`}
          bar={
            fill > 0.9
              ? "bg-[linear-gradient(90deg,var(--color-bad-deep),var(--color-bad-mid))]"
              : fill > 0.7
                ? "bg-[linear-gradient(90deg,var(--color-accent-dull),var(--color-warn))]"
                : "bg-[linear-gradient(90deg,var(--color-accent-deep),var(--color-accent))]"
          }
          fg={fill > 0.9 ? "text-bad-soft" : fill > 0.7 ? "text-warn" : "text-accent-soft"}
        />
      )}
      <div className={`${ROW} mb-12`}>
        <span className="text-11h text-ink-meta">{t("usage.day")}</span>
        <span className="font-mono text-11 text-ink-dim">{fmt(spent)}</span>
      </div>
      <div className={`${ROW} mb-12`}>
        <span className="text-11h text-ink-meta">{t("usage.rateLimited")}</span>
        <span
          className={`font-mono text-11 ${(query.data?.rateLimitIncidents ?? 0) > 0 ? "text-warn" : "text-good-soft"}`}
        >
          {query.data?.rateLimitIncidents ?? 0}
        </span>
      </div>
      <p className="text-11 text-ink-meta leading-prose mt-0 mx-0 mb-12">{t("usage.chipNote")}</p>
      <button
        type="button"
        onClick={() => {
          set({ usageOpen: false, tab: "Usage" });
        }}
        className="hover:bg-accent-a16 w-full p-9 rounded-10 border border-accent-a35 bg-accent-a09 text-accent-soft text-12 font-medium cursor-pointer transition-all duration-200"
      >
        {t("usage.openFull")}
      </button>
    </div>
  );
}
