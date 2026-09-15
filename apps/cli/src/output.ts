import { styleText } from "node:util";

export const line = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

export const print = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const fail = (message: string): never => {
  process.stderr.write(`ho: ${message}\n`);
  process.exit(1);
};

/**
 * Colour only on a terminal that can take it, and never when NO_COLOR is set (https://no-color.org).
 * `styleText` asks stdout for its colour depth on every call and answers plain text when there is
 * none, so neither the gate this module used to keep nor a colour package is needed to hold that rule.
 */
export const colour = {
  bold: (text: string): string => styleText("bold", text),
  dim: (text: string): string => styleText("dim", text),
  ok: (text: string): string => styleText("green", text),
  bad: (text: string): string => styleText("red", text),
  id: (text: string): string => styleText("cyan", text),
};
