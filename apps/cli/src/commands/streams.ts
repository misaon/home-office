import { compact, type StoredEvent, type Usage } from "@ho/protocol";
import { int, str } from "../args.ts";
import { type Command, output } from "../cli.ts";
import { line } from "../output.ts";

const SUMMARY_MAX = 160;

const summarize = (payload: unknown): string => {
  const text = JSON.stringify(payload);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 3)}...` : text;
};

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

/** `24h`, `7d` or plain hours. */
const hoursOf = (since: string | undefined): number | undefined => {
  if (since === undefined) {
    return undefined;
  }
  const span = /^(?<amount>\d+)(?<unit>[hd]?)$/u.exec(since)?.groups;
  if (span === undefined) {
    throw new Error(`--since expects hours or days like 24h or 7d, got "${since}"`);
  }
  return Number(span["amount"]) * (span["unit"] === "d" ? 24 : 1);
};

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
