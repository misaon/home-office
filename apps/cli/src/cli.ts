import { type Flags, parse, type Parsed } from "./args.ts";
import { connect, type HoClient } from "./client.ts";
import { line, print } from "./output.ts";

/** What an action produced: one line per human-readable row, and the payload `--json` prints instead. */
export type Output = { lines: readonly string[]; value: unknown };

/**
 * One thing `ho` does. Flags are declared once here: the parser accepts exactly these, `ho help` prints
 * them, and a missing required flag or positional is reported before the action runs. `client()` opens
 * the daemon connection on first use, so local actions (`daemon`, `ui`) never need one.
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

const flagUsage = (action: Action): string => {
  const parts = [
    ...(action.positionals ?? []),
    ...Object.entries(action.strings ?? {}).map(([flag, placeholder]) =>
      action.required?.includes(flag) === true
        ? `--${flag} ${placeholder}`
        : `[--${flag} ${placeholder}]`,
    ),
    ...(action.booleans ?? []).map((flag) => `[--${flag}]`),
    ...Object.entries(action.repeatable ?? {}).map(
      ([flag, placeholder]) => `[--${flag} ${placeholder}]...`,
    ),
  ];
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
};

/** `ho help`, generated from the command table so a flag documented once cannot drift out of the text. */
export const helpText = (commands: readonly Command[]): string =>
  [
    "ho — Home Office command line (--json prints the daemon's payload instead of the lines;\n  the streaming commands, `session watch` and `tail`, always print lines)",
    "",
    ...commands.flatMap((command) => [
      ...("subcommands" in command
        ? Object.entries(command.subcommands).map(
            ([sub, action]) => `  ho ${command.name} ${sub}${flagUsage(action)}`,
          )
        : [`  ho ${command.name}${flagUsage(command)}`]),
      `    ${command.summary}`,
    ]),
    "",
  ].join("\n");

const requiredPositionals = (action: Action): number =>
  (action.positionals ?? []).filter((name) => name.startsWith("<")).length;

async function runAction(action: Action, argv: readonly string[], what: string): Promise<void> {
  const parsed = parse(argv, action);
  if (parsed.positionals.length < requiredPositionals(action)) {
    const missing = action.positionals?.[parsed.positionals.length] ?? "argument";
    throw new Error(`${missing} is required\n\n  ho ${what}${flagUsage(action)}`);
  }
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

export async function run(commands: readonly Command[], argv: readonly string[]): Promise<void> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    line(helpText(commands));
    return;
  }
  const command = commands.find((c) => c.name === name);
  if (command === undefined) {
    throw new Error(`unknown command "${name}"\n\n${helpText(commands)}`);
  }
  if (!("subcommands" in command)) {
    await runAction(command, rest, command.name);
    return;
  }
  const [sub, ...subArgs] = rest;
  const action = sub === undefined ? undefined : command.subcommands[sub];
  if (sub === undefined || action === undefined) {
    throw new Error(
      `${sub === undefined ? "missing" : `unknown`} ${command.name} subcommand${sub === undefined ? "" : ` "${sub}"`}\n\n${helpText([command])}`,
    );
  }
  await runAction(action, subArgs, `${command.name} ${sub}`);
}
