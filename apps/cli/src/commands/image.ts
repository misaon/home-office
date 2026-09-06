import { withClient } from "../client.ts";
import { line } from "../output.ts";
import { subcommand } from "./usage.ts";

export async function image(args: readonly string[]): Promise<void> {
  const { sub } = subcommand(args, "image");
  if (sub !== "build") {
    throw new Error(`unknown image command "${sub}"`);
  }
  await withClient(async (client) => {
    for await (const { line: text } of await client.system.buildImages()) {
      line(text);
    }
    line("images ready");
  });
}
