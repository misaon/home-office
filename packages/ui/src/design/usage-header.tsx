import type { UsageSummary } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { DISPLAY, MONO, pill } from "./tokens.ts";
import { fmt, useDesign, type Window } from "./store.ts";

const WINDOWS: Window[] = ["24 h", "7 d", "all"];
const VIEWS = [
  ["Tokens", "usage.tokens"],
  ["Resources", "usage.resources"],
] as const;

const PILL = "py-6 px-11 rounded-pill cursor-pointer whitespace-nowrap transition-all duration-220";

const TOP = "flex items-start justify-between gap-10 mb-14";

const TOTAL = `${DISPLAY} font-bold text-30 tracking-display leading-flat whitespace-nowrap`;

const SPLIT = "flex h-8 rounded-pill overflow-hidden gap-2 mb-10";

const KEY = `flex items-center gap-6 ${MONO} text-10h text-ink-meta`;

export function UsageHeader({ summary }: { summary: UsageSummary | null }): React.JSX.Element {
  const { t } = useTranslation();
  const win = useDesign((s) => s.win);
  const usageView = useDesign((s) => s.usageView);
  const set = useDesign((s) => s.set);

  const totals = summary?.totals;
  const input = totals?.inputTokens ?? 0;
  const output = totals?.outputTokens ?? 0;
  const cache = totals?.cacheReadTokens ?? 0;
  const spend = input + output;
  const pct = (n: number): string => `${String(Math.round((n / Math.max(1, spend)) * 100))}%`;
  const composition = [
    { name: t("usage.in"), value: fmt(input), color: "bg-accent-moss", pct: pct(input) },
    { name: t("usage.out"), value: fmt(output), color: "bg-accent", pct: pct(output) },
    { name: t("usage.cache"), value: fmt(cache), color: "bg-good", pct: "0%" },
  ];

  return (
    <div className="pt-16 px-16 pb-14 border-b border-line mb-16">
      <div className={TOP}>
        <div className="min-w-0">
          <div className="flex items-baseline gap-9 min-w-0 flex-wrap">
            <span className={TOTAL}>{fmt(spend)}</span>
            <span className="text-11h text-ink-label whitespace-nowrap">
              {t("usage.headline", {
                window: win === "all" ? t("usage.allTime") : t("usage.lastWindow", { window: win }),
                count: summary?.sessions ?? 0,
              })}
            </span>
          </div>
        </div>
        <div className="flex gap-5 flex-[0_0_auto]">
          {VIEWS.map(([view, label]) => {
            const tone = pill(usageView === view);
            return (
              <button
                type="button"
                key={view}
                onClick={() => {
                  set({ usageView: view });
                }}
                className={`${PILL} text-12 ${tone} hover:-translate-y-1`}
              >
                {t(label)}
              </button>
            );
          })}
        </div>
      </div>
      <div className={SPLIT}>
        {composition.map((slice) => (
          <div
            key={slice.name}
            title={slice.name}
            className={`transition-[width] duration-600 ease-glide w-(--share) ${slice.color}`}
            style={{ "--share": slice.pct }}
          />
        ))}
      </div>
      <div className="flex gap-13 flex-wrap mb-14">
        {composition.map((slice) => (
          <span key={slice.name} className={KEY}>
            <span className={`w-6 h-6 rounded-2 ${slice.color}`} />
            <span>{slice.name}</span>
            <span>{slice.value}</span>
          </span>
        ))}
      </div>
      <div className="flex gap-6 flex-wrap">
        {WINDOWS.map((w) => {
          const tone = pill(win === w);
          return (
            <button
              type="button"
              key={w}
              onClick={() => {
                set({ win: w });
              }}
              className={`${PILL} ${MONO} text-11h ${tone} hover:-translate-y-1`}
            >
              {w}
            </button>
          );
        })}
      </div>
    </div>
  );
}
