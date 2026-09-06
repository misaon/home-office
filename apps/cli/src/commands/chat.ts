import { TaskId } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { print } from "../output.ts";
import { findProject } from "./lookup.ts";

export async function chat(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["project", "task"]);
  const text = parsed.positionals.join(" ").trim();
  if (text === "") {
    throw new Error("message text is required");
  }
  await withClient(async (client) => {
    const projectRef = str(parsed, "project");
    const projectId =
      projectRef === undefined ? undefined : (await findProject(client, projectRef)).id;
    const taskRef = str(parsed, "task");
    const taskId = taskRef === undefined ? undefined : TaskId.parse(taskRef);
    print(
      await client.chat.send({
        text,
        ...(projectId === undefined ? {} : { projectId }),
        ...(taskId === undefined ? {} : { taskId }),
      }),
    );
  });
}
