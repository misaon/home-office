import type { Command } from "../command.ts";
import { TaskId } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { colour, result } from "../output.ts";
import { findProject, onlyProject } from "./lookup.ts";

/**
 * Talks to a floor's boss (Lola carries the message to him), or answers a colleague's question with `--task`.
 * With one floor `--project` may be omitted.
 */
async function chat(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["project", "task"]);
  if (str(parsed, "task") !== undefined && str(parsed, "project") !== undefined) {
    throw new Error("choose exactly one of --task and --project");
  }
  const text = parsed.positionals.join(" ").trim();
  if (text === "") {
    throw new Error("message text is required");
  }
  await withClient(async (client) => {
    const taskRef = str(parsed, "task");
    if (taskRef !== undefined) {
      const answer = await client.chat.send({ text, taskId: TaskId.parse(taskRef) });
      result(`answered ${colour.id(TaskId.parse(taskRef))}`, answer);
      return;
    }
    const projectRef = str(parsed, "project");
    const project =
      projectRef === undefined ? await onlyProject(client) : await findProject(client, projectRef);
    const sent = await client.chat.send({ text, projectId: project.id });
    result(
      sent.task === null
        ? `sent to ${colour.bold(project.name)}`
        : `sent to ${colour.bold(project.name)}; the boss is on it as ${colour.id(sent.task.id)}`,
      sent,
    );
  });
}

export const chatCommand: Command = {
  name: "chat",
  summary:
    "to the floor's boss (the only floor when omitted); --task answers a colleague's question",
  usage: ["  ho chat <text> [--project <floor>] [--task <task-id>]"],
  run: chat,
};
