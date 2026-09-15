import { compact } from "@ho/protocol";
import { str } from "../flags.ts";
import { type Command, output } from "../cli.ts";
import { projectIdOf, projectNames } from "./lookup.ts";

export const intakeCommand: Command = {
  name: "intake",
  summary: "poll a floor's GitHub issues now, or show intake health per floor",
  subcommands: {
    poll: {
      strings: { project: "<floor>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = await projectIdOf(rpc, str(parsed, "project"));
        const results = await rpc.intake.poll(compact({ projectId }));
        const names = await projectNames(rpc);
        return output(
          results.length === 0
            ? ["no project has intake enabled (ho project set <project> --intake on)"]
            : results.map(
                (r) =>
                  `${names.get(r.projectId) ?? r.projectId}: received ${String(r.received)}, already known ${String(r.duplicates)}${r.dryRun.length === 0 ? "" : `, dry run would take: ${r.dryRun.join("; ")}`}`,
              ),
          results,
        );
      },
    },
    status: {
      run: async (_parsed, client) => {
        const rpc = await client();
        const listed = await rpc.projects.list();
        const projects = new Map(listed.map((p) => [p.id, p]));
        const status = await rpc.intake.status();
        return output(
          status.map((s) => {
            const project = projects.get(s.projectId);
            return `${project?.name ?? s.projectId}: ${s.enabled ? `enabled every ${String(project?.intake.intervalSeconds ?? "?")} s` : "disabled"}${project?.intake.dryRun === true ? " (dry run)" : ""}, labels=${project?.intake.labels.join(",") ?? ""}, last poll ${s.lastPollAt ?? "never"}, next ${s.nextPollAt ?? "-"}, received ${String(s.received)}${s.lastError === null ? "" : `, error: ${s.lastError}`}`;
          }),
          status,
        );
      },
    },
  },
};

export const mailCommand: Command = {
  name: "mail",
  summary: "issues the postman brought in, and their acknowledgements",
  subcommands: {
    list: {
      strings: { project: "<floor>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = await projectIdOf(rpc, str(parsed, "project"));
        const mail = await rpc.mail.list(compact({ projectId }));
        return output(
          mail.map((m) => {
            const last = m.acks.at(-1);
            return `${m.id}  #${m.externalId}  ${m.title}  by ${m.author || "?"}  task=${m.taskId ?? "-"}  ${last === undefined ? "unacknowledged" : `${last.outcome} @ ${last.at}`}`;
          }),
          mail,
        );
      },
    },
  },
};
