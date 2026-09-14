import { isSessionActive, type LiveEvent, type UsageSummary } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../kit/controls.tsx";
import { Popover, usePopover } from "../kit/popover.tsx";
import { usageQuery } from "../queries.ts";
import { useOnline, useUi } from "../store.ts";

/** The window the chip reports on, in hours; other windows live in the Usage panel. */
const WINDOW_HOURS = 24;
const PANEL_WIDTH = 300;

const short = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
      : String(n);

const spent = (usage: UsageSummary["totals"]): number => usage.inputTokens + usage.outputTokens;

/** The last thing a running session said about how full its context window is, where it says so. */
const contextOf = (events: readonly LiveEvent[] | undefined): number | null => {
  const last = events?.findLast((l) => l.event.kind === "context");
  return last === undefined || last.event.kind !== "context" || last.event.windowTokens === 0
    ? null
    : last.event.usedTokens / last.event.windowTokens;
};

const limitedUntil = (events: readonly LiveEvent[] | undefined): string | null => {
  const last = events?.findLast((l) => l.event.kind === "rate_limited");
  return last === undefined || last.event.kind !== "rate_limited" ? null : last.event.retryAt;
};

/** A bar for the one thing here with a real denominator: how full a running context window is. */
function Meter({ fill }: { fill: number }): React.JSX.Element {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/60">
      <div
        className={`h-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-soft)] ${
          fill > 0.9 ? "bg-bad" : fill > 0.7 ? "bg-warn" : "bg-accent"
        }`}
        style={{ width: `${String(Math.min(100, Math.round(fill * 100)))}%` }}
      />
    </div>
  );
}

/** One reading: its name on the left and its number on the right, the way a meter is read. */
function Reading({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-2xs text-faint">{label}</span>
      <span className={`font-mono text-2xs ${warn ? "text-warn" : "text-muted"}`}>{value}</span>
    </div>
  );
}

/**
 * What the floor has spent and whether anything is holding it up, without leaving the chat. The office
 * reports what its own sessions told it: tokens over a window, how many sessions are running, how full a
 * running context window is, and whether a provider asked it to come back later. It deliberately shows
 * no percentage of a plan's quota, because no provider tells the office what that quota is.
 */
export function UsageChip(): React.JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  const chip = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const panel = usePopover(chip, surface, { width: PANEL_WIDTH, align: "end" });
  const sessions = useUi((s) => s.snapshot.sessions);
  const agents = useUi((s) => s.snapshot.agents);
  const live = useUi((s) => s.live);
  const query = useQuery({ ...usageQuery(WINDOW_HOURS), enabled: online, refetchInterval: 15_000 });
  const summary = query.data ?? null;

  const running = [...sessions.values()].filter((s) => isSessionActive(s.state));
  const waiting =
    running.map((s) => limitedUntil(live.get(s.id))).find((at) => at !== null) ?? null;
  const tokens = summary === null ? 0 : spent(summary.totals);
  const dot = waiting !== null ? "bg-warn" : running.length > 0 ? "bg-good" : "bg-line-strong";

  return (
    <>
      <button
        ref={chip}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={panel.open}
        title={t("usage.chipTitle")}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-2xs ${
          panel.open ? "bg-line/70 text-text" : "text-muted hover:bg-line/50 hover:text-text"
        }`}
        onClick={panel.toggle}
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="font-mono">{short(tokens)}</span>
      </button>
      <Popover popover={panel} surface={surface} label={t("usage.chipTitle")} className="p-3">
        <div className="flex items-center gap-2 pb-2">
          <span className="text-2xs font-semibold tracking-widest text-faint uppercase">
            {t("usage.chipTitle")}
          </span>
          <Badge>{t("usage.day")}</Badge>
        </div>
        {summary === null ? (
          <p className="text-2xs text-faint">{t("usage.noData")}</p>
        ) : (
          <>
            <Reading label={t("usage.in")} value={short(summary.totals.inputTokens)} />
            <Reading label={t("usage.out")} value={short(summary.totals.outputTokens)} />
            <Reading label={t("usage.cache")} value={short(summary.totals.cacheReadTokens)} />
            <Reading label={t("usage.turns")} value={String(summary.totals.turns)} />
            <div className="my-2 h-px bg-line" />
            <Reading label={t("usage.running")} value={String(running.length)} />
            <Reading label={t("usage.sessions")} value={String(summary.sessions)} />
            <Reading
              label={t("usage.rateLimited")}
              value={summary.rateLimitIncidents === 0 ? "—" : String(summary.rateLimitIncidents)}
              warn={summary.rateLimitIncidents > 0}
            />
            {waiting === null ? null : (
              <Reading
                label={t("usage.retryAt")}
                value={new Date(waiting).toLocaleTimeString()}
                warn
              />
            )}
            {running.length === 0 ? null : (
              <div className="mt-2 space-y-2 border-t border-line pt-2">
                {running.map((s) => {
                  const fill = contextOf(live.get(s.id));
                  return (
                    <div key={s.id}>
                      <Reading
                        label={agents.get(s.agentId)?.name ?? t("chat.colleague")}
                        value={
                          fill === null
                            ? short(spent(s.usage))
                            : t("usage.context", { percent: Math.round(fill * 100) })
                        }
                      />
                      {fill === null ? null : <Meter fill={fill} />}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-2xs leading-relaxed text-faint">{t("usage.chipNote")}</p>
          </>
        )}
      </Popover>
    </>
  );
}
