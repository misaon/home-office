import { Breakdown, type Row } from "./usage-breakdown.tsx";
import { UsageHeader } from "./usage-header.tsx";
import { UsageResources } from "./usage-resources.tsx";
import { fmt, useDesign } from "./store.ts";

/** The first row carries the whole weight, the rest a share of it: how the mockup fakes a split. */
const share = (i: number, first: number, rest: number): number => (i === 0 ? first : rest);

/** What the office has spent: the split, the window, and who or what spent it. */
export function Usage(): React.JSX.Element {
  const counts = useDesign((s) => s.counts);
  const usageView = useDesign((s) => s.usageView);
  const floors = useDesign((s) => s.floors);
  const floorSel = useDesign((s) => s.floorSel);

  const spend = counts.in + counts.out;
  const team = floors[floorSel]?.team ?? [];
  const row = (
    name: string,
    weight: number,
    pct: string,
    inW: number,
    outW: number,
    cacheW: number,
  ): Row => ({
    name,
    total: fmt(Math.round(spend * weight)),
    pct,
    detail: `in ${fmt(Math.round(counts.in * inW))} · out ${fmt(Math.round(counts.out * outW))}`,
    cache: `cache ${fmt(Math.round(counts.cache * cacheW))}`,
  });

  const breakdowns = [
    {
      name: "by agent",
      rows: team.map((p, i) =>
        row(
          p.name,
          share(i, 1, 0.39),
          i === 0 ? "72%" : "28%",
          share(i, 1, 0.4),
          share(i, 1, 0.36),
          share(i, 1, 0.31),
        ),
      ),
    },
    {
      name: "by project",
      rows: floors.map((f, i) =>
        row(
          f.name,
          share(i, 1, 0.38),
          i === 0 ? "100%" : "38%",
          share(i, 1, 0.4),
          share(i, 1, 0.36),
          share(i, 1, 0.3),
        ),
      ),
    },
    {
      name: "by day",
      rows: [
        row("2026-09-13", 0.72, "72%", 0.7, 0.72, 0.7),
        row("2026-09-14", 0.28, "28%", 0.3, 0.28, 0.3),
      ],
    },
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
      <UsageHeader />
      <div style={{ padding: "0 16px 16px" }}>
        {usageView === "Tokens" ? (
          <div>
            {breakdowns.map((b) => (
              <Breakdown key={b.name} name={b.name} rows={b.rows} />
            ))}
          </div>
        ) : (
          <UsageResources />
        )}
      </div>
    </div>
  );
}
