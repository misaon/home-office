import { compact, type EvalScorecard } from "@ho/protocol";
import { str } from "../flags.ts";
import { type Command, output } from "../cli.ts";
import { projectIdOf } from "./lookup.ts";

type Counts = EvalScorecard["office"];

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

const share = (part: number, whole: number): string =>
  whole === 0 ? "n/a" : `${String(Math.round((part / whole) * 100))}%`;

const per = (total: number, whole: number): string =>
  whole === 0 ? "n/a" : (total / whole).toFixed(1);

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

const outcome = (counts: Counts): string =>
  `finished ${String(counts.finished)}  first-pass ${String(counts.firstPass)} (${share(counts.firstPass, counts.finished)})  blocked ${String(counts.blocked)}  failed ${String(counts.failed)}  rounds/task ${per(counts.reviewRounds, counts.finished)}`;

const spend = (counts: Counts): string => {
  const tokens = counts.usage.inputTokens + counts.usage.outputTokens;
  return `sessions ${String(counts.sessions)}  ${fmt(counts.minutes)} min  ${fmt(tokens)} tokens  per finished task: ${counts.finished === 0 ? "n/a" : `${fmt(tokens / counts.finished)} tokens, ${fmt(counts.minutes / counts.finished)} min`}`;
};

const officeLines = (card: EvalScorecard): string[] => [
  `window: ${card.since ?? "all time"} → ${card.until}`,
  `OFFICE  ${outcome(card.office)}  rated ${String(card.office.ratedGood)} good / ${String(card.office.ratedBad)} bad`,
  `        ${spend(card.office)}`,
];

const employeeLines = (card: EvalScorecard): string[] =>
  card.agents.length === 0
    ? []
    : [
        "-- employees",
        ...card.agents.map(
          (a) =>
            `${a.name.padEnd(10)} ${a.role.padEnd(10)} ${`${a.model}/${a.effort}`.padEnd(14)} ${outcome(a)}  bad ${String(a.ratedBad)}  ${spend(a)}`,
        ),
      ];

const reviewerLines = (card: EvalScorecard): string[] =>
  card.reviewers.length === 0
    ? []
    : [
        "-- reviewers",
        ...card.reviewers.map(
          (r) =>
            `${r.name.padEnd(10)} ${r.role.padEnd(10)} reviewed ${String(r.reviewed).padStart(3)}  approved ${String(r.approved).padStart(3)}  changes ${String(r.requestedChanges).padStart(3)}  escapes ${String(r.escapes).padStart(3)}`,
        ),
      ];

const attentionLines = (card: EvalScorecard): string[] =>
  card.attention.length === 0
    ? []
    : [
        "-- needs attention",
        ...card.attention.map(
          (item) =>
            `${item.flag.padEnd(10)} ${item.title.slice(0, 40).padEnd(40)} ${(item.agent ?? "-").padEnd(10)} rounds ${String(item.reviewRounds)}  sessions ${String(item.sessions)}  ${item.detail.slice(0, 60)}`,
        ),
      ];

export const evalCommand: Command = {
  name: "eval",
  summary:
    "how the office is doing: first-pass rate, review burden, cost per finished task, and what needs attention",
  strings: { since: "24h|7d", project: "<floor>" },
  run: async (parsed, client) => {
    const sinceHours = hoursOf(str(parsed, "since"));
    const rpc = await client();
    const projectId = await projectIdOf(rpc, str(parsed, "project"));
    const card = await rpc.evals.scorecard(compact({ sinceHours, projectId }));
    return output(
      [
        ...officeLines(card),
        ...employeeLines(card),
        ...reviewerLines(card),
        ...attentionLines(card),
      ],
      card,
    );
  },
};
