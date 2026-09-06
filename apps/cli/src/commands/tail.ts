import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line } from "../output.ts";

const MAX = 160;

const summarize = (payload: unknown): string => {
  const text = JSON.stringify(payload);
  return text.length > MAX ? `${text.slice(0, MAX - 3)}...` : text;
};

export async function tail(args: readonly string[]): Promise<void> {
  const parsed = parse(args, ["after"]);
  const after = str(parsed, "after");
  await withClient(async (client) => {
    const iterator = await client.events.subscribe(
      after === undefined ? {} : { afterSeq: Number(after) },
    );
    for await (const event of iterator) {
      line(
        `${String(event.seq).padStart(6)}  ${event.at}  ${event.type.padEnd(22)}  ${summarize(event.payload)}`,
      );
    }
  });
}
