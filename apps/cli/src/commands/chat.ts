import { TaskId } from "@ho/protocol";
import { str } from "../args.ts";
import { type Command, output } from "../cli.ts";
import { colour } from "../output.ts";
import { projectFor } from "./lookup.ts";

export const chatCommand: Command = {
  name: "chat",
  summary:
    "to the floor's boss (the only floor when omitted); --task answers a colleague's question",
  positionals: ["<text>..."],
  strings: { project: "<floor>", task: "<task-id>" },
  run: async (parsed, client) => {
    const taskRef = str(parsed, "task");
    const projectRef = str(parsed, "project");
    if (taskRef !== undefined && projectRef !== undefined) {
      throw new Error("choose exactly one of --task and --project");
    }
    const text = parsed.positionals.join(" ").trim();
    if (text === "") {
      throw new Error("message text is required");
    }
    const rpc = await client();
    if (taskRef !== undefined) {
      const taskId = TaskId.parse(taskRef);
      const answer = await rpc.chat.send({ text, taskId });
      return output([`answered ${colour.id(taskId)}`], answer);
    }
    const project = await projectFor(rpc, projectRef);
    const sent = await rpc.chat.send({ text, projectId: project.id });
    return output(
      [
        sent.task === null
          ? `sent to ${colour.bold(project.name)}`
          : `sent to ${colour.bold(project.name)}; the boss is on it as ${colour.id(sent.task.id)}`,
      ],
      sent,
    );
  },
};
