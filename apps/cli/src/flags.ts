import type { Parsed } from "./cli.ts";

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

export const list = (parsed: Parsed, name: string): string[] => {
  const value = parsed.flags[name];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

export const bool = (parsed: Parsed, name: string): boolean => parsed.flags[name] === true;

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
