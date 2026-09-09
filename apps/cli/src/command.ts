export type Command = {
  name: string;
  /** One line in `ho help`, after the usage lines. */
  summary: string;
  /** The invocation lines `ho help` prints for this command, in order. */
  usage: readonly string[];
  run: (args: readonly string[]) => Promise<void>;
};

export const commandUsage = (command: Command): string =>
  [...command.usage, `    ${command.summary}`].join("\n");

/** Splits `ho <group> <sub> …`; a missing subcommand shows that command's own usage, not the whole help. */
export const subcommand = (
  args: readonly string[],
  command: Command,
): { sub: string; rest: string[] } => {
  const [sub, ...rest] = args;
  if (sub === undefined) {
    throw new Error(`missing ${command.name} subcommand\n\n${commandUsage(command)}`);
  }
  return { sub, rest };
};
