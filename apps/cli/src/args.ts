import { parseArgs } from "node:util";

export type Parsed = { positionals: string[]; flags: Record<string, string | boolean | undefined> };

/** Thin wrapper over node:util parseArgs: every `--flag value` is a string, `--flag` alone is true. */
export function parse(
  argv: readonly string[],
  flags: readonly string[],
  booleans: readonly string[] = [],
): Parsed {
  const options: Record<string, { type: "string" | "boolean" }> = {};
  for (const flag of flags) {
    options[flag] = { type: "string" };
  }
  for (const flag of booleans) {
    options[flag] = { type: "boolean" };
  }
  const { values, positionals } = parseArgs({
    args: [...argv],
    options,
    allowPositionals: true,
    strict: true,
  });
  return { positionals, flags: values };
}

export const str = (parsed: Parsed, name: string): string | undefined => {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
};

export const required = (parsed: Parsed, name: string): string => {
  const value = str(parsed, name);
  if (value === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value;
};
