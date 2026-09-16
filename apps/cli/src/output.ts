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

export const colour = {
  bold: (text: string): string => styleText("bold", text),
  dim: (text: string): string => styleText("dim", text),
  ok: (text: string): string => styleText("green", text),
  bad: (text: string): string => styleText("red", text),
  id: (text: string): string => styleText("cyan", text),
};
