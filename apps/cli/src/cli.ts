import { CommanderError, Command as Program } from "commander";
import { connect, type HoClient } from "./client.ts";
import { line, print } from "./output.ts";

export type Output = { lines: readonly string[]; value: unknown };

export type Flags = {
  strings?: Readonly<Record<string, string>>;
  booleans?: readonly string[];
  repeatable?: Readonly<Record<string, string>>;
  required?: readonly string[];
};

export type Parsed = {
  positionals: string[];
  flags: Record<string, string | boolean | (string | boolean)[] | undefined>;
};

export type Action = Flags & {
  positionals?: readonly string[];
  run: (parsed: Parsed, client: () => Promise<HoClient>) => Promise<Output | undefined>;
};

export type Command = { name: string; summary: string } & (
  | { subcommands: Readonly<Record<string, Action>> }
  | Action
);

export const output = (lines: readonly string[], value: unknown): Output => ({ lines, value });

async function runAction(action: Action, parsed: Parsed): Promise<void> {
  const state: { connection: Awaited<ReturnType<typeof connect>> | null } = { connection: null };
  const client = async (): Promise<HoClient> => {
    state.connection ??= await connect();
    return state.connection.client;
  };
  try {
    const result = await action.run(parsed, client);
    if (result === undefined) {
      return;
    }
    if (parsed.flags["json"] === true) {
      print(result.value);
    } else {
      for (const text of result.lines) {
        line(text);
      }
    }
  } finally {
    state.connection?.close();
  }
}

const collect = (value: string, previous: string[]): string[] => [...previous, value];

function declare(command: Program, action: Action): Program {
  for (const name of action.positionals ?? []) {
    command.argument(name);
  }
  for (const [flag, placeholder] of Object.entries(action.strings ?? {})) {
    const spec = `--${flag} <${placeholder.replaceAll(/[<>[\]]/gu, "")}>`;
    if (action.required?.includes(flag) === true) {
      command.requiredOption(spec, placeholder);
    } else {
      command.option(spec, placeholder);
    }
  }
  for (const flag of action.booleans ?? []) {
    command.option(`--${flag}`, flag);
  }
  for (const [flag, placeholder] of Object.entries(action.repeatable ?? {})) {
    command.option(
      `--${flag} <${placeholder.replaceAll(/[<>[\]]/gu, "")}>`,
      placeholder,
      collect,
      [],
    );
  }
  return command.option("--json", "print the daemon's payload instead of the lines");
}

const dashed = (name: string): string => name.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);

function parsedFrom(options: Record<string, unknown>, positionals: readonly unknown[]): Parsed {
  const flags: Parsed["flags"] = {};
  const keep = (name: string, value: Parsed["flags"][string]): void => {
    flags[name] = value;
    flags[dashed(name)] = value;
  };
  for (const [name, value] of Object.entries(options)) {
    if (typeof value === "string" || typeof value === "boolean") {
      keep(name, value);
    } else if (Array.isArray(value)) {
      keep(
        name,
        value.filter(
          (entry): entry is string | boolean =>
            typeof entry === "string" || typeof entry === "boolean",
        ),
      );
    }
  }
  return {
    positionals: positionals.flat().filter((value): value is string => typeof value === "string"),
    flags,
  };
}

export async function run(commands: readonly Command[], argv: readonly string[]): Promise<void> {
  const program = new Program()
    .name("ho")
    .description(
      "Home Office command line (--json prints the daemon's payload instead of the lines;\n" +
        "the streaming commands, `session watch` and `tail`, always print lines)",
    )
    .showHelpAfterError()
    .exitOverride();

  const attach = (parent: Program, name: string, summary: string, action: Action): void => {
    const child = parent.command(name);
    if (summary !== "") {
      child.description(summary);
    }
    declare(child, action);
    child.action(async (...args: unknown[]) => {
      const options = child.opts();
      await runAction(action, parsedFrom(options, args.slice(0, -2)));
    });
  };

  for (const command of commands) {
    if ("subcommands" in command) {
      const group = program.command(command.name).description(command.summary);
      for (const [sub, action] of Object.entries(command.subcommands)) {
        attach(group, sub, "", action);
      }
    } else {
      attach(program, command.name, command.summary, command);
    }
  }

  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }
    const { code } = error;
    if (
      code === "commander.helpDisplayed" ||
      code === "commander.help" ||
      code === "commander.version"
    ) {
      return;
    }
    process.exit(1);
  }
}
