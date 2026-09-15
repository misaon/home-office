import { type UsageSummary } from "@ho/protocol";
import { type TFunction } from "i18next";
import { type Floor } from "./data.ts";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usageQuery } from "../queries.ts";
import { UsageHeader } from "./usage-header.tsx";
import { UsageResources } from "./usage-resources.tsx";
import { type Window, fmt, useDesign } from "./store.ts";
import { DISPLAY, MONO, separator } from "./tokens.ts";

type Row = { name: string; total: string; pct: string; detail: string; cache: string };

const HEADING = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const CARD = "rounded-14 bg-card border border-edge overflow-hidden";

const NAME = `${MONO} text-12 text-ink-dim overflow-hidden text-ellipsis whitespace-nowrap max-w-[45%]`;

const LANE = "flex-1 h-4 rounded-pill bg-slot overflow-hidden min-w-40";

const FILL =
  "block h-full rounded-pill bg-[linear-gradient(90deg,var(--color-accent-deep),var(--color-accent))] origin-left animate-grow";

const TOTAL = `${DISPLAY} font-semibold text-13 text-accent-soft flex-[0_0_auto]`;

const DETAIL = `flex justify-between gap-9 mt-7 ${MONO} text-10 text-ink-meta`;

/** One way of slicing the spend: a name, its share as a bar, and its total. */
function Breakdown({ name, rows }: { name: string; rows: Row[] }): React.JSX.Element {
  return (
    <div className="mb-18">
      <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
        <span className={HEADING}>{name}</span>
        <span className="flex-1 h-1 bg-slot" />
      </div>
      <div className={CARD}>
        {rows.map((row, i) => (
          <div
            key={row.name}
            className={`py-12 px-13 transition-[background] duration-200 ${separator(i === 0)} hover:bg-row-hover`}
          >
            <div className="flex items-center gap-11">
              <span className={NAME}>{row.name}</span>
              <span className={LANE}>
                <span className={`${FILL} w-(--share)`} style={{ "--share": row.pct }} />
              </span>
              <span className={TOTAL}>{row.total}</span>
            </div>
            <div className={DETAIL}>
              <span>{row.detail}</span>
              <span>{row.cache}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const HOURS: Record<Window, number> = { "24 h": 24, "7 d": 168, all: 0 };

const spentIn = (usage: UsageSummary["totals"]): number => usage.inputTokens + usage.outputTokens;

/** One bucket as the design draws a row: a name, a share, a total and the detail under it. */
function rowsOf(buckets: UsageSummary["byAgent"], say: TFunction): Row[] {
  const top = Math.max(1, ...buckets.map((b) => spentIn(b.usage)));
  return buckets.map((bucket) => ({
    name: bucket.label,
    total: fmt(spentIn(bucket.usage)),
    pct: `${String(Math.round((spentIn(bucket.usage) / top) * 100))}%`,
    detail: say("usage.inOut", {
      in: fmt(bucket.usage.inputTokens),
      out: fmt(bucket.usage.outputTokens),
    }),
    cache: say("usage.cacheOf", { value: fmt(bucket.usage.cacheReadTokens) }),
  }));
}

/** What the office has spent: the split, the window, and who or what spent it. */
export function Usage({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const usageView = useDesign((s) => s.usageView);
  const win = useDesign((s) => s.win);
  const query = useQuery({ ...usageQuery(HOURS[win]), refetchInterval: 15_000 });
  const summary = query.data ?? null;

  const breakdowns =
    summary === null
      ? []
      : [
          { name: t("usage.byAgent"), rows: rowsOf(summary.byAgent, t) },
          { name: t("usage.byProject"), rows: rowsOf(summary.byProject, t) },
          { name: t("usage.byDay"), rows: rowsOf(summary.byDay, t) },
        ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-slide-420">
      <UsageHeader summary={summary} />
      <div className="pt-0 px-16 pb-16">
        {usageView === "Tokens" ? (
          summary === null ? (
            <div className="py-16 px-2 text-12 text-ink-meta">{t("usage.noData")}</div>
          ) : (
            <div>
              {breakdowns.map((b) => (
                <Breakdown key={b.name} name={b.name} rows={b.rows} />
              ))}
            </div>
          )
        ) : (
          <UsageResources floor={floor} />
        )}
      </div>
    </div>
  );
}
