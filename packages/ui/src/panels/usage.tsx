import type { UsageSummary } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
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
    <Section title={title}>
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
              <td className="truncate py-1.5">{r.label}</td>
              <td className="text-right">{fmt(r.usage.inputTokens)}</td>
              <td className="text-right">{fmt(r.usage.outputTokens)}</td>
              <td className="text-right">{fmt(r.usage.cacheReadTokens)}</td>
              <td className="text-right">{String(r.sessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function UsagePanel(): React.JSX.Element {
  const connection = useUi((s) => s.connection);
  const [hours, setHours] = useState(24);
  const query = useQuery({
    queryKey: ["usage", hours],
    queryFn: ({ signal }) =>
      requireClient().usage.summary(hours === 0 ? {} : { sinceHours: hours }, { signal }),
    enabled: connection === "online",
    refetchInterval: 10_000,
  });
  const summary = query.data ?? null;
  return (
    <div className="space-y-5 overflow-y-auto p-4">
      <div className="flex items-center gap-2.5 text-xs">
        <span className="text-gray-400">Window</span>
        {[24, 24 * 7, 0].map((h) => (
          <button
            key={h}
            type="button"
            className={`rounded-md px-3 py-1.5 ${hours === h ? "bg-accent font-medium text-black" : "bg-panel hover:bg-line"}`}
            onClick={() => {
              setHours(h);
            }}
          >
            {h === 0 ? "all" : h === 24 ? "24 h" : "7 d"}
          </button>
        ))}
      </div>
      {query.error === null ? null : (
        <p role="alert" className="text-red-400">
          {query.error.message}
        </p>
      )}
      {summary === null ? (
        <p className="text-xs text-gray-400">No data yet.</p>
      ) : (
        <>
          <div className="leading-relaxed text-xs text-gray-300">
            {String(summary.sessions)} sessions · {fmt(summary.totals.inputTokens)} in ·{" "}
            {fmt(summary.totals.outputTokens)} out · {fmt(summary.totals.cacheReadTokens)} cache
            read · {String(summary.rateLimitIncidents)} rate-limit incidents
          </div>
          <Buckets title="By agent" rows={summary.byAgent} />
          <Buckets title="By project" rows={summary.byProject} />
          <Buckets title="By day" rows={summary.byDay} />
          <p className="leading-relaxed text-xs text-gray-500">
            Token counts come from Claude Code. OpenCode, Gemini CLI and Codex speak ACP, which
            reports how full the context window is and the session&apos;s cost rather than a token
            split — those arrive live and are shown per session in Agent.
          </p>
        </>
      )}
    </div>
  );
}
