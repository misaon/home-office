import type { Usage } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

const fmt = (n: number): string => n.toLocaleString("en-US");
const row = (label: string, u: Usage, sessions?: number): string =>
  `${label.padEnd(24)} in=${fmt(u.inputTokens).padStart(10)} out=${fmt(u.outputTokens).padStart(9)} cache=${fmt(u.cacheReadTokens).padStart(10)} write=${fmt(u.cacheWriteTokens).padStart(9)} turns=${String(u.turns).padStart(5)}${sessions === undefined ? "" : ` sessions=${String(sessions)}`}`;

export async function usage(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["since"]);
  const since = str(parsed, "since");
  const sinceHours =
    since === undefined
      ? undefined
      : Number(since.endsWith("d") ? Number(since.slice(0, -1)) * 24 : since.replace(/h$/u, ""));
  await withClient(async (client) => {
    const summary = await client.usage.summary(sinceHours === undefined ? {} : { sinceHours });
    line(
      `window: ${summary.since ?? "all time"}  sessions: ${String(summary.sessions)}  rate-limit incidents: ${String(summary.rateLimitIncidents)}`,
    );
    line(row("TOTAL", summary.totals));
    for (const [title, buckets] of [
      ["by agent", summary.byAgent],
      ["by project", summary.byProject],
      ["by day", summary.byDay],
    ] as const) {
      if (buckets.length > 0) {
        line(`-- ${title}`);
        for (const b of buckets) {
          line(row(b.label, b.usage, b.sessions));
        }
      }
    }
  });
}
