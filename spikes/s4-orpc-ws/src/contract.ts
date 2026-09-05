import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";

export const contract = {
  system: {
    health: oc.output(z.object({ ok: z.literal(true), now: z.string() })),
  },
  math: {
    add: oc.input(z.object({ a: z.number(), b: z.number() })).output(z.object({ sum: z.number() })),
  },
  events: {
    ticks: oc
      .input(z.object({ count: z.number().int().positive() }))
      .output(eventIterator(z.object({ seq: z.number().int(), at: z.number() }))),
  },
};
