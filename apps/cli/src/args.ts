import { parseArgs } from "node:util";

export type Parsed = {
  positionals: string[];
  flags: Record<string, string | boolean | (string | boolean)[] | undefined>;
};

export function parse(
  argv: readonly string[],
  flags: readonly string[],
  booleans: readonly string[] = [],
  repeatable: readonly string[] = [],
): Parsed {
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {};
  for (const flag of flags) {
    options[flag] = { type: "string" };
  }
  for (const flag of booleans) {
    options[flag] = { type: "boolean" };
  }
  for (const flag of repeatable) {
    options[flag] = { type: "string", multiple: true };
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

export const list = (parsed: Parsed, name: string): string[] => {
  const value = parsed.flags[name];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

export const required = (parsed: Parsed, name: string): string => {
  const value = str(parsed, name);
  if (value === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value;
};
