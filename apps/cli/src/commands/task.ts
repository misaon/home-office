import { type Command, subcommand } from "../command.ts";
import { compact, TaskId, TaskPriority, TaskStatus } from "@ho/protocol";
import { z } from "zod";
import { parse, required, str } from "../args.ts";
import { withClient } from "../client.ts";
import { colour, line, print, result } from "../output.ts";
import { findAgent, findProject } from "./lookup.ts";

const statusColour = (status: TaskStatus): string => {
  if (status === "failed" || status === "blocked") {
    return colour.bad(status);
  }
  if (status === "done") {
    return colour.ok(status);
  }
  return status;
};

const taskId = (ref: string | undefined): TaskId => {
  if (ref === undefined) {
    throw new Error("task id is required");
  }
  return TaskId.parse(ref);
};

async function task(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, taskCommand);
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
        const created = await client.tasks.create({
          projectId,
          title: required(parsed, "title"),
          ...compact({
            brief,
            assigneeId,
            priority: TaskPriority.optional().parse(priority),
          }),
        });
        result(
          `${colour.id(created.id)} ${created.status} ${created.priority} ${colour.bold(created.title)}`,
          created,
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
        const assigned = await client.tasks.assign({ id: taskId(idRef), agentId });
        result(
          agentId === null
            ? `${colour.id(assigned.id)} unassigned, now ${assigned.status}`
            : `${colour.id(assigned.id)} assigned to ${agentRef}, now ${assigned.status}`,
          assigned,
        );
        return;
      }
      case "move": {
        const [idRef, status] = parsed.positionals;
        const reason = str(parsed, "reason");
        const moved = await client.tasks.transition({
          id: taskId(idRef),
          to: TaskStatus.parse(status),
          ...compact({ reason }),
        });
        result(
          `${colour.id(moved.id)} → ${statusColour(moved.status)}${reason === undefined ? "" : ` (${reason})`}`,
          moved,
        );
        return;
      }
      default: {
        throw new Error(`unknown task command "${sub}"`);
      }
    }
  });
}

export const taskCommand: Command = {
  name: "task",
  summary: "the floor's work; move takes any status the state machine allows",
  usage: [
    "  ho task list [--project <project>] [--status a,b]",
    "  ho task create --project <project> --title <text> [--brief <text>] [--assignee <agent>] [--priority normal]",
    "  ho task show <task-id>",
    "  ho task assign <task-id> <agent|none>",
    "  ho task move <task-id> <status> [--reason <text>]",
  ],
  run: task,
};
