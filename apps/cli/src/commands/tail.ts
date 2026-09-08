import type { Command } from "../command.ts";
import { compact } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

const MAX = 160;

const summarize = (payload: unknown): string => {
  const text = JSON.stringify(payload);
  return text.length > MAX ? `${text.slice(0, MAX - 3)}...` : text;
};

async function tail(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["after"]);
  const after = str(parsed, "after");
  const afterSeq = after === undefined ? undefined : Number(after);
  await withClient(async (client) => {
    const iterator = await client.events.subscribe(compact({ afterSeq }));
    for await (const event of iterator) {
      line(
        `${String(event.seq).padStart(6)}  ${event.at}  ${event.type.padEnd(22)}  ${summarize(event.payload)}`,
      );
    }
  });
}

export const tailCommand: Command = {
  name: "tail",
  summary: "stored domain events: replay from a sequence, then live",
  usage: ["  ho tail [--after <seq>]"],
  run: tail,
};
