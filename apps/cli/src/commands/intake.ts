import { compact } from "@ho/protocol";
import { withClient } from "../client.ts";
import { parse, str } from "../args.ts";
import { line } from "../output.ts";
import { findProject } from "./lookup.ts";
import { subcommand } from "./help.ts";

/** `ho intake poll [--project <ref>]` and `ho intake status`: GitHub Issues intake on demand and its health. */
export async function intake(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "intake");
  const parsed = parse(rest, ["project"]);
  await withClient(async (client) => {
    switch (sub) {
      case "poll": {
        const ref = str(parsed, "project");
        const projectId = ref === undefined ? undefined : (await findProject(client, ref)).id;
        const results = await client.intake.poll(compact({ projectId }));
        const projects = new Map((await client.projects.list()).map((p) => [p.id, p.name]));
        for (const r of results) {
          line(
            `${projects.get(r.projectId) ?? r.projectId}: received ${String(r.received)}, already known ${String(r.duplicates)}${r.dryRun.length === 0 ? "" : `, dry run would take: ${r.dryRun.join("; ")}`}`,
          );
        }
        if (results.length === 0) {
          line("no project has intake enabled (ho project set <project> --intake on)");
        }
        return;
      }
      case "status": {
        const projects = new Map((await client.projects.list()).map((p) => [p.id, p]));
        for (const s of await client.intake.status()) {
          const project = projects.get(s.projectId);
          line(
            `${project?.name ?? s.projectId}: ${s.enabled ? `enabled every ${String(project?.intake.intervalSeconds ?? "?")} s` : "disabled"}${project?.intake.dryRun === true ? " (dry run)" : ""}, labels=${project?.intake.labels.join(",") ?? ""}, last poll ${s.lastPollAt ?? "never"}, next ${s.nextPollAt ?? "-"}, received ${String(s.received)}${s.lastError === null ? "" : `, error: ${s.lastError}`}`,
          );
        }
        return;
      }
      default: {
        throw new Error(`unknown intake command "${sub}"`);
      }
    }
  });
}

/** `ho mail list [--project <ref>]`: what the postman brought in and what the office told the source. */
export async function mail(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "mail");
  if (sub !== "list") {
    throw new Error(`unknown mail command "${sub}"`);
  }
  const parsed = parse(rest, ["project"]);
  await withClient(async (client) => {
    const ref = str(parsed, "project");
    const projectId = ref === undefined ? undefined : (await findProject(client, ref)).id;
    for (const m of await client.mail.list(compact({ projectId }))) {
      const last = m.acks.at(-1);
      line(
        `${m.id}  #${m.externalId}  ${m.title}  by ${m.author || "?"}  task=${m.taskId ?? "-"}  ${last === undefined ? "unacknowledged" : `${last.outcome} @ ${last.at}`}`,
      );
    }
  });
}
