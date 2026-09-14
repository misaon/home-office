import { DISPLAY, MONO, pill } from "./tokens.ts";
import { fmt, useDesign, type Window } from "./store.ts";

const WINDOWS: Window[] = ["24 h", "7 d", "all"];
const VIEWS = ["Tokens", "Resources"] as const;

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
export function UsageHeader(): React.JSX.Element {
  const counts = useDesign((s) => s.counts);
  const win = useDesign((s) => s.win);
  const usageView = useDesign((s) => s.usageView);
  const set = useDesign((s) => s.set);
  const runCounts = useDesign((s) => s.runCounts);

  const spend = counts.in + counts.out;
  const pct = (n: number): string => `${String(Math.round((n / Math.max(1, spend)) * 100))}%`;
  const composition = [
    { name: "in", value: fmt(counts.in), color: "#8C7A2E", pct: pct(counts.in) },
    { name: "out", value: fmt(counts.out), color: "var(--a,#FFC531)", pct: pct(counts.out) },
    { name: "cache", value: fmt(counts.cache), color: "#5BD9A0", pct: "0%" },
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
              {`tokens · ${win === "all" ? "all time" : `last ${win}`} · ${String(counts.sessions)}${counts.sessions === 1 ? " session" : " sessions"}`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", flex: "0 0 auto" }}>
          {VIEWS.map((view) => {
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
                className="hop4"
              >
                {view}
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
                runCounts();
              }}
              style={{
                ...PILL,
                ...MONO,
                fontSize: "11.5px",
                border: `1px solid ${tone.bd}`,
                background: tone.bg,
                color: tone.fg,
              }}
              className="hop4"
            >
              {w}
            </button>
          );
        })}
      </div>
    </div>
  );
}
