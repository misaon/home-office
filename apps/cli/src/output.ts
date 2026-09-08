import { bold, cyan, dim, green, red, yellow } from "yoctocolors";

let asJson = false;

/** `--json` makes every command print the daemon's own payload instead of a human line. */
export const setJsonOutput = (on: boolean): void => {
  asJson = on;
};

export const jsonOutput = (): boolean => asJson;

export const line = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

export const print = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/** What a command changed: one human line by default, the payload with `--json`. */
export const result = (human: string, value: unknown): void => {
  if (asJson) {
    print(value);
    return;
  }
  line(human);
};

export const fail = (message: string, code = 1): never => {
  process.stderr.write(`ho: ${message}\n`);
  process.exit(code);
};

const plain = <T>(text: T): T => text;
const paint = process.stdout.isTTY && Bun.env["NO_COLOR"] === undefined;

/** Colour only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export const colour = {
  bold: paint ? bold : plain,
  dim: paint ? dim : plain,
  ok: paint ? green : plain,
  warn: paint ? yellow : plain,
  bad: paint ? red : plain,
  id: paint ? cyan : plain,
};
