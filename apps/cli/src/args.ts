import { parseArgs } from "node:util";

export type Parsed = {
  positionals: string[];
  flags: Record<string, string | boolean | (string | boolean)[] | undefined>;
};

/** What an action accepts: string flags with the placeholder `--help` shows, booleans, and repeatable strings. */
export type Flags = {
  strings?: Readonly<Record<string, string>>;
  booleans?: readonly string[];
  repeatable?: Readonly<Record<string, string>>;
  /** String flags that must be present; everything else is optional. */
  required?: readonly string[];
};

export function parse(argv: readonly string[], flags: Flags): Parsed {
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {
    json: { type: "boolean" },
  };
  for (const flag of Object.keys(flags.strings ?? {})) {
    options[flag] = { type: "string" };
  }
  for (const flag of flags.booleans ?? []) {
    options[flag] = { type: "boolean" };
  }
  for (const flag of Object.keys(flags.repeatable ?? {})) {
    options[flag] = { type: "string", multiple: true };
  }
  const { values, positionals } = parseArgs({
    args: [...argv],
    options,
    allowPositionals: true,
    strict: true,
  });
  for (const flag of flags.required ?? []) {
    if (typeof values[flag] !== "string") {
      throw new TypeError(`--${flag} is required`);
    }
  }
  return { positionals, flags: values };
}

export const str = (parsed: Parsed, name: string): string | undefined => {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
};

/** A flag the dispatcher already checked for presence; the throw only narrows the type. */
export const required = (parsed: Parsed, name: string): string => {
  const value = str(parsed, name);
  if (value === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value;
};

export const list = (parsed: Parsed, name: string): string[] => {
  const value = parsed.flags[name];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

export const bool = (parsed: Parsed, name: string): boolean => parsed.flags[name] === true;

/** A whole number, or a readable error instead of a NaN sent to the daemon. */
export const int = (parsed: Parsed, name: string): number | undefined => {
  const value = str(parsed, name);
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new TypeError(`--${name} expects a whole number, got "${value}"`);
  }
  return number;
};

export const onOff = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === "on" || value === "off") {
    return value === "on";
  }
  throw new Error(`expected on|off, got "${value}"`);
};
