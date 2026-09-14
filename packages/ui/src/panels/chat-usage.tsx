import { isSessionActive, type LiveEvent, type UsageSummary } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { usageQuery } from "../queries.ts";
import { useOnline, useUi } from "../store.ts";

/** The window the chip reports on, in hours; other windows live in the Usage panel. */
const WINDOW_HOURS = 24;

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

/** shadcn's progress paints its own indicator, so the colour is handed to it from the outside. */
const bar = (fill: number): string =>
  fill > 0.9
    ? "[&_[data-slot=progress-indicator]]:bg-destructive"
    : fill > 0.7
      ? "[&_[data-slot=progress-indicator]]:bg-warn"
      : "";

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
      <span className="text-2xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-2xs ${warn ? "text-warn" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

/** How full a running context window is: the one number here with a denominator worth a bar. */
function ContextBar({ name, fill }: { name: string; fill: number }): React.JSX.Element {
  const { t } = useTranslation();
  const percent = Math.min(100, Math.round(fill * 100));
  return (
    <div className="space-y-1">
      <Reading label={name} value={t("usage.context", { percent })} warn={fill > 0.7} />
      <Progress value={percent} className={`h-1.5 ${bar(fill)}`} />
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
  const sessions = useUi((s) => s.snapshot.sessions);
  const agents = useUi((s) => s.snapshot.agents);
  const live = useUi((s) => s.live);
  const query = useQuery({ ...usageQuery(WINDOW_HOURS), enabled: online, refetchInterval: 15_000 });
  const summary = query.data ?? null;

  const running = [...sessions.values()].filter((s) => isSessionActive(s.state));
  const waiting =
    running.map((s) => limitedUntil(live.get(s.id))).find((at) => at !== null) ?? null;
  const fills = running
    .map((s) => ({
      name: agents.get(s.agentId)?.name ?? t("chat.colleague"),
      fill: contextOf(live.get(s.id)),
    }))
    .filter((row): row is { name: string; fill: number } => row.fill !== null);
  const fullest = fills.length === 0 ? 0 : Math.max(...fills.map((row) => row.fill));
  const tokens = summary === null ? 0 : spent(summary.totals);
  const dot = waiting !== null ? "bg-warn" : running.length > 0 ? "bg-good" : "bg-input";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" title={t("usage.chipTitle")} className="gap-1.5">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
          <span className="font-mono">{short(tokens)}</span>
          {fills.length === 0 ? null : (
            <>
              <Progress
                value={Math.round(fullest * 100)}
                aria-label={t("usage.contextLabel")}
                className={`h-1 w-8 ${bar(fullest)}`}
              />
              <span className="font-mono">{`${String(Math.round(fullest * 100))}%`}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-76 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
            {t("usage.chipTitle")}
          </span>
          <Badge variant="outline">{t("usage.day")}</Badge>
        </div>
        {summary === null ? (
          <p className="text-2xs text-muted-foreground">{t("usage.noData")}</p>
        ) : (
          <>
            <Reading label={t("usage.in")} value={short(summary.totals.inputTokens)} />
            <Reading label={t("usage.out")} value={short(summary.totals.outputTokens)} />
            <Reading label={t("usage.cache")} value={short(summary.totals.cacheReadTokens)} />
            <Reading label={t("usage.turns")} value={String(summary.totals.turns)} />
            <Separator />
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
            {fills.length === 0 ? null : (
              <>
                <Separator />
                <div className="space-y-2">
                  {fills.map((row) => (
                    <ContextBar key={row.name} name={row.name} fill={row.fill} />
                  ))}
                </div>
              </>
            )}
            <p className="text-2xs leading-relaxed text-muted-foreground">{t("usage.chipNote")}</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
