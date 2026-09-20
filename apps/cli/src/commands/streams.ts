import { clip, compact, type StoredEvent, type Usage } from "@ho/protocol";
import { hoursOf, int, str } from "../flags.ts";
import { type Command, output } from "../cli.ts";
import { line } from "../output.ts";

const SUMMARY_MAX = 160;

const summarize = (payload: unknown): string => clip(JSON.stringify(payload), SUMMARY_MAX);

const eventLine = (event: StoredEvent): string =>
  `${String(event.seq).padStart(6)}  ${event.at}  ${event.type.padEnd(22)}  ${summarize(event.payload)}`;

export const tailCommand: Command = {
  name: "tail",
  summary: "stored domain events: replay from a sequence, then live",
  strings: { after: "<seq>" },
  run: async (parsed, client) => {
    const afterSeq = int(parsed, "after");
    const rpc = await client();
    for await (const event of await rpc.events.subscribe(compact({ afterSeq }))) {
      line(eventLine(event));
    }
    return undefined;
  },
};

const fmt = (n: number): string => n.toLocaleString("en-US");
const row = (label: string, u: Usage, sessions?: number): string =>
  `${label.padEnd(24)} in=${fmt(u.inputTokens).padStart(10)} out=${fmt(u.outputTokens).padStart(9)} cache=${fmt(u.cacheReadTokens).padStart(10)} write=${fmt(u.cacheWriteTokens).padStart(9)} turns=${String(u.turns).padStart(5)}${sessions === undefined ? "" : ` sessions=${String(sessions)}`}`;

export const usageCommand: Command = {
  name: "usage",
  summary: "tokens per agent, project and day",
  strings: { since: "24h|7d" },
  run: async (parsed, client) => {
    const sinceHours = hoursOf(str(parsed, "since"));
    const rpc = await client();
    const summary = await rpc.usage.summary(compact({ sinceHours }));
    const lines = [
      `window: ${summary.since ?? "all time"}  sessions: ${String(summary.sessions)}  rate-limit incidents: ${String(summary.rateLimitIncidents)}`,
      row("TOTAL", summary.totals),
    ];
    for (const [title, buckets] of [
      ["by agent", summary.byAgent],
      ["by project", summary.byProject],
      ["by day", summary.byDay],
    ] as const) {
      if (buckets.length > 0) {
        lines.push(`-- ${title}`, ...buckets.map((b) => row(b.label, b.usage, b.sessions)));
      }
    }
    return output(lines, summary);
  },
};
