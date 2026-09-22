import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { Measure } from "./measure.ts";

export const Report = z.object({
  at: z.string(),
  floor: z.string(),
  iterations: z.int(),
  measures: z.array(Measure),
});
export type Report = z.infer<typeof Report>;

type Average = {
  runs: number;
  fulfilled: number;
  minutes: number;
  tokens: number;
  costUsd: number | null;
  reviewRounds: number;
  firstPassShare: number | null;
};

const COLUMNS = [
  ["key", 16],
  ["it", 3],
  ["outcome", 10],
  ["min", 6],
  ["sess", 5],
  ["turns", 6],
  ["tokens", 9],
  ["cost", 7],
  ["rounds", 7],
  ["fix", 4],
  ["first-pass", 11],
] as const;

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const money = (usd: number | null): string => (usd === null ? "-" : `$${usd.toFixed(2)}`);

const row = (cells: readonly string[]): string =>
  cells.map((cell, index) => cell.padEnd(COLUMNS[index]?.[1] ?? 8)).join(" ");

export function printTable(report: Report, out: (line: string) => void): void {
  out("");
  out(
    `regression run on floor "${report.floor}" at ${report.at}, ${String(report.iterations)} iteration(s)`,
  );
  out(row(COLUMNS.map(([name]) => name)));
  for (const m of report.measures) {
    out(
      row([
        m.key,
        String(m.iteration),
        m.outcome,
        m.minutes.toFixed(1),
        String(m.sessions),
        String(m.turns),
        String(m.tokens),
        money(m.costUsd),
        String(m.reviewRounds),
        String(m.fixRounds),
        m.workTasks === 0 ? "-" : `${String(m.firstPass)}/${String(m.workTasks)}`,
      ]),
    );
  }
}

export function averagesOf(measures: readonly Measure[]): Map<string, Average> {
  const groups = new Map<string, Measure[]>();
  for (const m of measures) {
    groups.set(m.key, [...(groups.get(m.key) ?? []), m]);
  }
  return new Map(
    [...groups].map(([key, runs]) => {
      const costs = runs.map((m) => m.costUsd).filter((cost): cost is number => cost !== null);
      const work = runs.reduce((sum, m) => sum + m.workTasks, 0);
      return [
        key,
        {
          runs: runs.length,
          fulfilled: runs.filter((m) => m.outcome === "fulfilled").length,
          minutes: mean(runs.map((m) => m.minutes)),
          tokens: mean(runs.map((m) => m.tokens)),
          costUsd: costs.length === 0 ? null : mean(costs),
          reviewRounds: mean(runs.map((m) => m.reviewRounds)),
          firstPassShare: work === 0 ? null : runs.reduce((sum, m) => sum + m.firstPass, 0) / work,
        },
      ];
    }),
  );
}

const delta = (before: number, after: number, digits: number): string => {
  const change = after - before;
  return `${before.toFixed(digits)} → ${after.toFixed(digits)} (${change >= 0 ? "+" : ""}${change.toFixed(digits)})`;
};

const share = (value: number | null): string =>
  value === null ? "-" : `${String(Math.round(value * 100))}%`;

export function compare(current: Report, baseline: Report): string[] {
  const now = averagesOf(current.measures);
  const then = averagesOf(baseline.measures);
  const lines = ["", `against ${baseline.at} on "${baseline.floor}":`];
  for (const [key, after] of now) {
    const before = then.get(key);
    if (before === undefined) {
      lines.push(`${key.padEnd(16)} new in this run`);
      continue;
    }
    lines.push(
      `${key.padEnd(16)} fulfilled ${String(before.fulfilled)}/${String(before.runs)} → ${String(after.fulfilled)}/${String(after.runs)}  minutes ${delta(before.minutes, after.minutes, 1)}  tokens ${delta(before.tokens, after.tokens, 0)}  cost ${money(before.costUsd)} → ${money(after.costUsd)}  review rounds ${delta(before.reviewRounds, after.reviewRounds, 1)}  first-pass ${share(before.firstPassShare)} → ${share(after.firstPassShare)}`,
    );
  }
  return lines;
}

export async function readReport(path: string): Promise<Report> {
  const raw: unknown = await Bun.file(path).json();
  return Report.parse(raw);
}

export async function writeReport(report: Report, path: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}
