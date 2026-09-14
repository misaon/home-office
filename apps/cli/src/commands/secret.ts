import { SecretKeyName } from "@ho/protocol";
import { $ } from "bun";
import { type Command, output } from "../cli.ts";

const restoreEcho = (): void => {
  void $`stty echo`.quiet().nothrow();
  process.stderr.write("\n");
};

/** Reads the secret from a pipe, or from the terminal with echo disabled. Never from argv. */
async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).trim();
  }
  process.stderr.write("secret value (input hidden, press Enter): ");
  // Ctrl-C mid-prompt would otherwise leave the terminal without echo.
  const interrupted = (): void => {
    restoreEcho();
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  await $`stty -echo`.quiet().nothrow();
  try {
    for await (const chunk of console) {
      return chunk.trim();
    }
    return "";
  } finally {
    process.off("SIGINT", interrupted);
    restoreEcho();
  }
}

export const secretCommand: Command = {
  name: "secret",
  summary:
    "keys: anthropic-oauth-token, anthropic-api-key, openai-api-key, gemini-api-key, github-token; the value arrives on stdin or through a hidden prompt, never in argv",
  subcommands: {
    status: {
      run: async (_parsed, client) => {
        const { present } = await (await client()).secrets.status();
        return output(
          SecretKeyName.options.map(
            (key) => `${key}: ${present.includes(key) ? "present" : "missing"}`,
          ),
          { present },
        );
      },
    },
    set: {
      positionals: ["<key>"],
      run: async (parsed, client) => {
        const key = SecretKeyName.parse(parsed.positionals[0]);
        const value = await readSecret();
        if (value === "") {
          throw new Error("empty secret");
        }
        const stored = await (await client()).secrets.set({ key, value });
        return output([`${key}: stored`], stored);
      },
    },
    rm: {
      positionals: ["<key>"],
      run: async (parsed, client) => {
        const key = SecretKeyName.parse(parsed.positionals[0]);
        const removed = await (await client()).secrets.delete({ key });
        return output([`${key}: removed`], removed);
      },
    },
  },
};
