import { commandUsage } from "../command.ts";
import { COMMANDS } from "./table.ts";

/** `ho help`, generated from the command table so a flag documented once cannot drift out of the text. */
export const helpText = (): string =>
  [
    "ho — Home Office command line",
    "",
    ...COMMANDS.map((command) => commandUsage(command)),
    "",
  ].join("\n");
