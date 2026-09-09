import { type Command, subcommand } from "../command.ts";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

async function image(args: readonly string[]): Promise<void> {
  const { sub } = subcommand(args, imageCommand);
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

export const imageCommand: Command = {
  name: "image",
  summary: "build the agent and git-bridge images",
  usage: ["  ho image build"],
  run: image,
};
