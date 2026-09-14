import { bold, cyan, dim, green, red } from "yoctocolors";

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

const plain = <T>(text: T): T => text;
const paint = process.stdout.isTTY && Bun.env["NO_COLOR"] === undefined;

/** Colour only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export const colour = {
  bold: paint ? bold : plain,
  dim: paint ? dim : plain,
  ok: paint ? green : plain,
  bad: paint ? red : plain,
  id: paint ? cyan : plain,
};
