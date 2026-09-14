import type { UsageSummary } from "@ho/protocol";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { usageQuery } from "../queries.ts";
import { Breakdown, type Row } from "./usage-breakdown.tsx";
import { UsageHeader } from "./usage-header.tsx";
import { UsageResources } from "./usage-resources.tsx";
import { fmt, useDesign, type Window } from "./store.ts";

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
    <div
      style={{
        flex: "1",
        minHeight: "0",
        overflowY: "auto",
        animation: "slideLeft .42s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      <UsageHeader summary={summary} />
      <div style={{ padding: "0 16px 16px" }}>
        {usageView === "Tokens" ? (
          summary === null ? (
            <div style={{ padding: "16px 2px", fontSize: "12px", color: "#A6A39C" }}>
              {t("usage.noData")}
            </div>
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
