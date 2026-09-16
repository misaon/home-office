import { SecretKeyName } from "@ho/protocol";
import { $ } from "bun";
import { type Command, output } from "../cli.ts";

const restoreEcho = (): void => {
  void $`stty echo`.quiet().nothrow();
  process.stderr.write("\n");
};

async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    const piped = await Bun.stdin.text();
    return piped.trim();
  }
  process.stderr.write("secret value (input hidden, press Enter): ");
  const interrupted = (): void => {
    restoreEcho();
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  await $`stty -echo`.quiet().nothrow();
  try {
    const typed = await console[Symbol.asyncIterator]().next();
    return typed.done === true ? "" : typed.value.trim();
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
        const rpc = await client();
        const { present } = await rpc.secrets.status();
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
        const rpc = await client();
        const stored = await rpc.secrets.set({ key, value });
        return output([`${key}: stored`], stored);
      },
    },
    rm: {
      positionals: ["<key>"],
      run: async (parsed, client) => {
        const key = SecretKeyName.parse(parsed.positionals[0]);
        const rpc = await client();
        const removed = await rpc.secrets.delete({ key });
        return output([`${key}: removed`], removed);
      },
    },
  },
};
