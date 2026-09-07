import { TaskId } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { print } from "../output.ts";
import { findProject, onlyProject } from "./lookup.ts";

/**
 * Talks to a floor's boss (Lola carries the message to him), or answers a colleague's question with `--task`.
 * With one floor `--project` may be omitted.
 */
export async function chat(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["project", "task"]);
  const text = parsed.positionals.join(" ").trim();
  if (text === "") {
    throw new Error("message text is required");
  }
  await withClient(async (client) => {
    const taskRef = str(parsed, "task");
    if (taskRef !== undefined) {
      print(await client.chat.send({ text, taskId: TaskId.parse(taskRef) }));
      return;
    }
    const projectRef = str(parsed, "project");
    const project =
      projectRef === undefined ? await onlyProject(client) : await findProject(client, projectRef);
    print(await client.chat.send({ text, projectId: project.id }));
  });
}
