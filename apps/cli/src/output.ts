export const print = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const line = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

export const fail = (message: string, code = 1): never => {
  process.stderr.write(`ho: ${message}\n`);
  process.exit(code);
};
