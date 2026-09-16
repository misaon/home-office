import { CommanderError, Command as Program } from "commander";
import { connect, type HoClient } from "./client.ts";
import { line, print } from "./output.ts";

/** What an action produced: one line per human-readable row, and the payload `--json` prints instead. */
export type Output = { lines: readonly string[]; value: unknown };

/** What an action accepts: string flags with the placeholder `--help` shows, booleans, repeatables. */
export type Flags = {
  strings?: Readonly<Record<string, string>>;
  booleans?: readonly string[];
  repeatable?: Readonly<Record<string, string>>;
  /** String flags that must be present; everything else is optional. */
  required?: readonly string[];
};

/** What an action reads its arguments out of; commander fills it, the accessors below type it. */
export type Parsed = {
  positionals: string[];
  flags: Record<string, string | boolean | (string | boolean)[] | undefined>;
};

/**
 * One thing `ho` does. Flags are declared once here: commander accepts exactly these, generates
 * `--help` from them, and reports a missing required flag or positional before the action runs.
 * `client()` opens the daemon connection on first use, so local actions (`daemon`, `ui`) never need one.
 */
export type Action = Flags & {
  /** Positionals in order; `<name>` is required, `[name]` optional, a trailing `...` takes the rest. */
  positionals?: readonly string[];
  run: (parsed: Parsed, client: () => Promise<HoClient>) => Promise<Output | undefined>;
};

export type Command = { name: string; summary: string } & (
  | { subcommands: Readonly<Record<string, Action>> }
  | Action
);

export const output = (lines: readonly string[], value: unknown): Output => ({ lines, value });

/** Opens the connection once, only if the action asks for it, and closes it however the action ends. */
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

/** Declares one action on a commander command: its positionals, then its three kinds of flag. */
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

/** `--dry-run` reaches an action as commander's own `dryRun`; both spellings are kept so either reads. */
const dashed = (name: string): string => name.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);

/** What commander parsed, narrowed to the three shapes an action reads: string, boolean, string list. */
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
    // `exitOverride` turns commander's own `process.exit` into a throw, for every outcome including
    // the successful ones. Commander has already written the help, or the error, to the right stream;
    // what is left is only the exit code.
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
