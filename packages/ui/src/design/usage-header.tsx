import type { UsageSummary } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { DISPLAY, MONO, pill } from "./tokens.ts";
import { fmt, useDesign, type Window } from "./store.ts";

const WINDOWS: Window[] = ["24 h", "7 d", "all"];
const VIEWS = [
  ["Tokens", "usage.tokens"],
  ["Resources", "usage.resources"],
] as const;

const PILL: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: "99px",
  cursor: "pointer",
  fontSize: "12px",
  whiteSpace: "nowrap",
  transition: "all .22s",
};

const TOP: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "14px",
};

const TOTAL: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "30px",
  letterSpacing: "-.02em",
  lineHeight: "1",
  whiteSpace: "nowrap",
};

const SPLIT: React.CSSProperties = {
  display: "flex",
  height: "8px",
  borderRadius: "99px",
  overflow: "hidden",
  gap: "2px",
  marginBottom: "10px",
};

const KEY: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  ...MONO,
  fontSize: "10.5px",
  color: "#A6A39C",
};

/** The headline figure, how it splits, and over which window it was counted. */
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
    { name: t("usage.in"), value: fmt(input), color: "#8C7A2E", pct: pct(input) },
    { name: t("usage.out"), value: fmt(output), color: "var(--a,#FFC531)", pct: pct(output) },
    { name: t("usage.cache"), value: fmt(cache), color: "#5BD9A0", pct: "0%" },
  ];

  return (
    <div
      style={{ padding: "16px 16px 14px", borderBottom: "1px solid #1B1B1F", marginBottom: "16px" }}
    >
      <div style={TOP}>
        <div style={{ minWidth: "0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "9px",
              minWidth: "0",
              flexWrap: "wrap",
            }}
          >
            <span style={TOTAL}>{fmt(spend)}</span>
            <span style={{ fontSize: "11.5px", color: "#ABA8A1", whiteSpace: "nowrap" }}>
              {t("usage.headline", {
                window: win === "all" ? t("usage.allTime") : t("usage.lastWindow", { window: win }),
                count: summary?.sessions ?? 0,
              })}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", flex: "0 0 auto" }}>
          {VIEWS.map(([view, label]) => {
            const tone = pill(usageView === view);
            return (
              <button
                type="button"
                key={view}
                onClick={() => {
                  set({ usageView: view });
                }}
                style={{
                  ...PILL,
                  border: `1px solid ${tone.bd}`,
                  background: tone.bg,
                  color: tone.fg,
                }}
                className="ho-1962ef"
              >
                {t(label)}
              </button>
            );
          })}
        </div>
      </div>
      <div style={SPLIT}>
        {composition.map((slice) => (
          <div
            key={slice.name}
            title={slice.name}
            style={{
              transition: "width .6s cubic-bezier(.2,.9,.3,1)",
              background: slice.color,
              width: slice.pct,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "13px", flexWrap: "wrap", marginBottom: "14px" }}>
        {composition.map((slice) => (
          <span key={slice.name} style={KEY}>
            <span
              style={{ width: "6px", height: "6px", borderRadius: "2px", background: slice.color }}
            />
            <span>{slice.name}</span>
            <span>{slice.value}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {WINDOWS.map((w) => {
          const tone = pill(win === w);
          return (
            <button
              type="button"
              key={w}
              onClick={() => {
                set({ win: w });
              }}
              style={{
                ...PILL,
                ...MONO,
                fontSize: "11.5px",
                border: `1px solid ${tone.bd}`,
                background: tone.bg,
                color: tone.fg,
              }}
              className="ho-1962ef"
            >
              {w}
            </button>
          );
        })}
      </div>
    </div>
  );
}
