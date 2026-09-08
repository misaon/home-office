import { type Command, subcommand } from "../command.ts";
import { SecretKeyName } from "@ho/protocol";
import { $ } from "bun";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

/** Reads the secret from a pipe, or from the terminal with echo disabled. Never from argv. */
async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).trim();
  }
  process.stderr.write("secret value (input hidden, press Enter): ");
  await $`stty -echo`.quiet().nothrow();
  try {
    for await (const chunk of console) {
      return chunk.trim();
    }
    return "";
  } finally {
    await $`stty echo`.quiet().nothrow();
    process.stderr.write("\n");
  }
}

async function secret(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, secretCommand);
  await withClient(async (client) => {
    switch (sub) {
      case "status": {
        const { present } = await client.secrets.status();
        for (const key of SecretKeyName.options) {
          line(`${key}: ${present.includes(key) ? "present" : "missing"}`);
        }
        return;
      }
      case "set": {
        const key = SecretKeyName.parse(rest[0]);
        const value = await readSecret();
        if (value === "") {
          throw new Error("empty secret");
        }
        await client.secrets.set({ key, value });
        line(`${key}: stored`);
        return;
      }
      case "rm": {
        const key = SecretKeyName.parse(rest[0]);
        await client.secrets.delete({ key });
        line(`${key}: removed`);
        return;
      }
      default: {
        throw new Error(`unknown secret command "${sub}"`);
      }
    }
  });
}

export const secretCommand: Command = {
  name: "secret",
  summary:
    "keys: anthropic-oauth-token, anthropic-api-key, openai-api-key, gemini-api-key, github-token; the value arrives on stdin or through a hidden prompt, never in argv",
  usage: ["  ho secret status | set <key> | rm <key>"],
  run: secret,
};
