import { compact, TaskId, TaskPriority, TaskStatus } from "@ho/protocol";
import { z } from "zod";
import { required, str } from "../args.ts";
import { type Command, output } from "../cli.ts";
import { colour, print } from "../output.ts";
import { findAgent, findProject, projectIdOf } from "./lookup.ts";

const statusColour = (status: TaskStatus): string => {
  if (status === "failed" || status === "blocked") {
    return colour.bad(status);
  }
  return status === "done" ? colour.ok(status) : status;
};

const taskId = (ref: string | undefined): TaskId => TaskId.parse(ref);

export const taskCommand: Command = {
  name: "task",
  summary: "the floor's work; move takes any status the state machine allows",
  subcommands: {
    list: {
      strings: { project: "<floor>", status: "a,b" },
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = await projectIdOf(rpc, str(parsed, "project"));
        const statusRaw = str(parsed, "status");
        const status =
          statusRaw === undefined ? undefined : z.array(TaskStatus).parse(statusRaw.split(","));
        const tasks = await rpc.tasks.list(compact({ projectId, status }));
        return output(
          tasks.map(
            (t) =>
              `${t.id}  ${t.status.padEnd(11)}  ${t.priority.padEnd(6)}  ${t.title}${t.assigneeId === undefined ? "" : `  → ${t.assigneeId}`}`,
          ),
          tasks,
        );
      },
    },
    create: {
      strings: {
        project: "<floor>",
        title: "<text>",
        brief: "<text>",
        assignee: "<agent>",
        priority: "low|normal|high",
      },
      required: ["project", "title"],
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = (await findProject(rpc, required(parsed, "project"))).id;
        const assigneeRef = str(parsed, "assignee");
        const assigneeId =
          assigneeRef === undefined ? undefined : (await findAgent(rpc, assigneeRef, projectId)).id;
        const created = await rpc.tasks.create({
          projectId,
          title: required(parsed, "title"),
          ...compact({
            brief: str(parsed, "brief"),
            assigneeId,
            priority: TaskPriority.optional().parse(str(parsed, "priority")),
          }),
        });
        return output(
          [
            `${colour.id(created.id)} ${created.status} ${created.priority} ${colour.bold(created.title)}`,
          ],
          created,
        );
      },
    },
    show: {
      positionals: ["<task-id>"],
      run: async (parsed, client) => {
        print(await (await client()).tasks.get({ id: taskId(parsed.positionals[0]) }));
        return undefined;
      },
    },
    assign: {
      positionals: ["<task-id>", "<agent|none>"],
      run: async (parsed, client) => {
        const rpc = await client();
        const [idRef, agentRef = ""] = parsed.positionals;
        const current = await rpc.tasks.get({ id: taskId(idRef) });
        const agentId =
          agentRef === "none" ? null : (await findAgent(rpc, agentRef, current.projectId)).id;
        const assigned = await rpc.tasks.assign({ id: current.id, agentId });
        return output(
          [
            agentId === null
              ? `${colour.id(assigned.id)} unassigned, now ${assigned.status}`
              : `${colour.id(assigned.id)} assigned to ${agentRef}, now ${assigned.status}`,
          ],
          assigned,
        );
      },
    },
    move: {
      positionals: ["<task-id>", "<status>"],
      strings: { reason: "<text>" },
      run: async (parsed, client) => {
        const [idRef, status] = parsed.positionals;
        const reason = str(parsed, "reason");
        const moved = await (
          await client()
        ).tasks.transition({
          id: taskId(idRef),
          to: TaskStatus.parse(status),
          ...compact({ reason }),
        });
        return output(
          [
            `${colour.id(moved.id)} → ${statusColour(moved.status)}${reason === undefined ? "" : ` (${reason})`}`,
          ],
          moved,
        );
      },
    },
  },
};
