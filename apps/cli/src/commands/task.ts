import { compact, TaskId, TaskPriority, TaskStatus } from "@ho/protocol";
import { z } from "zod";
import { parse, required, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { findAgent, findProject } from "./lookup.ts";
import { subcommand } from "./help.ts";

const taskId = (ref: string | undefined): TaskId => {
  if (ref === undefined) {
    throw new Error("task id is required");
  }
  return TaskId.parse(ref);
};

export async function task(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "task");
  const parsed = parse(rest, [
    "project",
    "status",
    "title",
    "brief",
    "assignee",
    "priority",
    "reason",
  ]);
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        const projectRef = str(parsed, "project");
        const projectId =
          projectRef === undefined ? undefined : (await findProject(client, projectRef)).id;
        const statusRaw = str(parsed, "status");
        const status =
          statusRaw === undefined ? undefined : z.array(TaskStatus).parse(statusRaw.split(","));
        const tasks = await client.tasks.list(compact({ projectId, status }));
        for (const t of tasks) {
          const assignee = t.assigneeId === undefined ? "" : `  → ${t.assigneeId}`;
          line(`${t.id}  ${t.status.padEnd(11)}  ${t.priority.padEnd(6)}  ${t.title}${assignee}`);
        }
        return;
      }
      case "create": {
        const projectId = (await findProject(client, required(parsed, "project"))).id;
        const assigneeRef = str(parsed, "assignee");
        const assigneeId =
          assigneeRef === undefined
            ? undefined
            : (await findAgent(client, assigneeRef, projectId)).id;
        const brief = str(parsed, "brief");
        const priority = str(parsed, "priority");
        print(
          await client.tasks.create({
            projectId,
            title: required(parsed, "title"),
            ...compact({
              brief,
              assigneeId,
              priority: TaskPriority.optional().parse(priority),
            }),
          }),
        );
        return;
      }
      case "show": {
        print(await client.tasks.get({ id: taskId(parsed.positionals[0]) }));
        return;
      }
      case "assign": {
        const [idRef, agentRef] = parsed.positionals;
        if (agentRef === undefined) {
          throw new Error("agent reference or none is required");
        }
        const current = await client.tasks.get({ id: taskId(idRef) });
        const agentId =
          agentRef === "none" ? null : (await findAgent(client, agentRef, current.projectId)).id;
        print(await client.tasks.assign({ id: taskId(idRef), agentId }));
        return;
      }
      case "move": {
        const [idRef, status] = parsed.positionals;
        const reason = str(parsed, "reason");
        print(
          await client.tasks.transition({
            id: taskId(idRef),
            to: TaskStatus.parse(status),
            ...compact({ reason }),
          }),
        );
        return;
      }
      default: {
        throw new Error(`unknown task command "${sub}"`);
      }
    }
  });
}
