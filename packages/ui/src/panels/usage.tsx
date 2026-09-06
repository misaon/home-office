import type { UsageSummary } from "@ho/protocol";
import { useEffect, useState } from "react";
import { getClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const fmt = (n: number): string => n.toLocaleString();

function Buckets({
  title,
  rows,
}: {
  title: string;
  rows: UsageSummary["byAgent"];
}): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase">{title}</h3>
      <table className="w-full text-left text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="font-normal">name</th>
            <th className="text-right font-normal">in</th>
            <th className="text-right font-normal">out</th>
            <th className="text-right font-normal">cache</th>
            <th className="text-right font-normal">sessions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="truncate py-0.5">{r.label}</td>
              <td className="text-right">{fmt(r.usage.inputTokens)}</td>
              <td className="text-right">{fmt(r.usage.outputTokens)}</td>
              <td className="text-right">{fmt(r.usage.cacheReadTokens)}</td>
              <td className="text-right">{String(r.sessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function UsagePanel(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const connection = useUi((s) => s.connection);
  const [hours, setHours] = useState(24);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  useEffect(() => {
    const client = getClient();
    if (client === null) {
      return;
    }
    client.usage.summary(hours === 0 ? {} : { sinceHours: hours }).then(setSummary, () => null);
  }, [hours, snapshot, connection]);
  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">Window</span>
        {[24, 24 * 7, 0].map((h) => (
          <button
            key={h}
            type="button"
            className={`rounded px-2 py-0.5 ${hours === h ? "bg-accent text-black" : "bg-panel"}`}
            onClick={() => {
              setHours(h);
            }}
          >
            {h === 0 ? "all" : h === 24 ? "24 h" : "7 d"}
          </button>
        ))}
      </div>
      {summary === null ? (
        <p className="text-xs text-gray-400">No data yet.</p>
      ) : (
        <>
          <div className="text-xs text-gray-300">
            {String(summary.sessions)} sessions · {fmt(summary.totals.inputTokens)} in ·{" "}
            {fmt(summary.totals.outputTokens)} out · {fmt(summary.totals.cacheReadTokens)} cache
            read · {String(summary.rateLimitIncidents)} rate-limit incidents
          </div>
          <Buckets title="By agent" rows={summary.byAgent} />
          <Buckets title="By project" rows={summary.byProject} />
          <Buckets title="By day" rows={summary.byDay} />
        </>
      )}
    </div>
  );
}
