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

export const positive = (parsed: Parsed, name: string): number | undefined => {
  const number = int(parsed, name);
  if (number !== undefined && number < 1) {
    throw new RangeError(`--${name} expects a number above zero, got "${String(number)}"`);
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

export const hoursOf = (since: string | undefined): number | undefined => {
  if (since === undefined) {
    return undefined;
  }
  const span = /^(?<amount>\d+)(?<unit>[hd]?)$/u.exec(since)?.groups;
  if (span === undefined) {
    throw new Error(`--since expects hours or days like 24h or 7d, got "${since}"`);
  }
  return Number(span["amount"]) * (span["unit"] === "d" ? 24 : 1);
};
