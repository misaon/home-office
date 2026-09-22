import { isTerminal } from "@ho/core";
import { resolveHome } from "@ho/daemon";
import type { Mandate, Project, ProjectId, TaskId } from "@ho/protocol";
import { connect, type Office } from "./client.ts";
import { emptyMeasure, type Measure, measure, type Outcome } from "./measure.ts";
import { compare, printTable, readReport, type Report, writeReport } from "./report.ts";
import { readSpec } from "./spec.ts";

const POLL_MS = 10_000;
const MINUTE_MS = 60_000;
const ANSWER_GRACE_MS = MINUTE_MS;
const BLOCKED_GRACE_MS = 3 * MINUTE_MS;
const DEFAULT_TIMEOUT_MINUTES = 45;

const flag = (name: string): string | undefined => {
  const at = Bun.argv.indexOf(`--${name}`);
  const value = Bun.argv[at + 1];
  return at === -1 || value === undefined ? undefined : value;
};

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

const floorOf = (projects: readonly Project[], wanted: string): Project => {
  const found = projects.find(
    (project) => project.id === wanted || project.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (found === undefined) {
    throw new Error(
      `no floor "${wanted}"; floors: ${projects.map((project) => project.name).join(", ")}`,
    );
  }
  return found;
};

type Closed = { mandate: Mandate | null; outcome: Outcome };

async function awaitClose(
  office: Office,
  projectId: ProjectId,
  rootTaskId: TaskId,
  deadline: number,
): Promise<Closed> {
  let parkedSince: number | null = null;
  for (;;) {
    const mandates = await office.mandates.list({ projectId });
    const mandate = mandates.find((entry) => entry.rootTaskId === rootTaskId) ?? null;
    if (mandate?.status === "fulfilled" || mandate?.status === "abandoned") {
      return { mandate, outcome: mandate.status };
    }
    const root = await office.tasks.get({ id: rootTaskId });
    const now = Date.now();
    const parked = mandate === null ? isTerminal(root.status) : mandate.status === "blocked";
    parkedSince = parked ? (parkedSince ?? now) : null;
    const grace = mandate === null ? ANSWER_GRACE_MS : BLOCKED_GRACE_MS;
    if (parkedSince !== null && now - parkedSince >= grace) {
      const outcome: Outcome =
        mandate === null ? (root.status === "done" ? "answered" : "blocked") : "blocked";
      return { mandate, outcome };
    }
    if (now >= deadline) {
      return { mandate, outcome: "timeout" };
    }
    await Bun.sleep(POLL_MS);
  }
}

const defaultOut = (home: string): string =>
  `${home}/regression/${new Date().toISOString().replaceAll(":", "-")}.json`;

const { office, close } = await connect();
try {
  const wanted = flag("floor");
  if (wanted === undefined) {
    throw new Error("--floor <name or id> is required; the floor must exist and have its team");
  }
  const floor = floorOf(await office.projects.list(), wanted);
  const spec = await readSpec(
    flag("spec") ?? new URL("../requests.json", import.meta.url).pathname,
  );
  const iterations = Number(flag("iterations") ?? "1");
  const timeoutMs = Number(flag("timeout-minutes") ?? String(DEFAULT_TIMEOUT_MINUTES)) * MINUTE_MS;
  const measures: Measure[] = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    for (const request of spec.requests) {
      out(`→ ${request.key} (${String(iteration)}/${String(iterations)})`);
      const from = Date.now();
      const sent = await office.chat.send({
        projectId: floor.id,
        text: request.text,
        attachments: [],
        thread: { kind: "new" },
      });
      if (sent.task === null) {
        measures.push(emptyMeasure(request.key, iteration, "no_boss"));
        out("  the floor has no boss; nothing was triaged");
        continue;
      }
      const closed = await awaitClose(office, floor.id, sent.task.id, from + timeoutMs);
      const measured = await measure(
        office,
        floor.id,
        { key: request.key, iteration, rootTaskId: sent.task.id },
        closed,
        { from, to: Date.now() },
      );
      measures.push(measured);
      out(`  ${measured.outcome} in ${measured.minutes.toFixed(1)} min`);
    }
  }
  const report: Report = { at: new Date().toISOString(), floor: floor.name, iterations, measures };
  printTable(report, out);
  const baseline = flag("baseline");
  if (baseline !== undefined) {
    for (const line of compare(report, await readReport(baseline))) {
      out(line);
    }
  }
  const written = await writeReport(report, flag("out") ?? defaultOut(resolveHome()));
  out(`report written to ${written}`);
} finally {
  close();
}
