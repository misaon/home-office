import type { Parsed } from "./cli.ts";

/**
 * Reading one flag out of what commander parsed, with the type the action wants. Commander validates
 * that a flag exists and that a required one was given; these say what its value means.
 */

export const str = (parsed: Parsed, name: string): string | undefined => {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
};

/** A flag commander already checked for presence; the throw only narrows the type. */
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
