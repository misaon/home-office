import { line, setJsonOutput } from "../output.ts";
import { helpText } from "./help.ts";
import { COMMANDS } from "./table.ts";

const HELP = new Set(["help", "--help", "-h"]);
const byName = new Map(COMMANDS.map((command) => [command.name, command]));

export async function run(argv: readonly string[]): Promise<void> {
  setJsonOutput(argv.includes("--json"));
  const [name, ...rest] = argv.filter((arg) => arg !== "--json");
  if (name === undefined || HELP.has(name)) {
    line(helpText());
    return;
  }
  const command = byName.get(name);
  if (command === undefined) {
    throw new Error(`unknown command "${name}"\n\n${helpText()}`);
  }
  await command.run(rest);
}
