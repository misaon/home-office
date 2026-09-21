import { compact, type Mandate, MandateStatus } from "@ho/protocol";
import { z } from "zod";
import { type Command, output } from "../cli.ts";
import { str } from "../flags.ts";
import { colour, print } from "../output.ts";
import { pick, projectIdOf } from "./lookup.ts";

const statusColour = (status: MandateStatus): string => {
  if (status === "blocked" || status === "abandoned") {
    return colour.bad(status);
  }
  return status === "fulfilled" ? colour.ok(status) : status;
};

const line = (mandate: Mandate): string =>
  `${mandate.id}  ${statusColour(mandate.status).padEnd(10)}  round ${String(mandate.round)}  ${String(mandate.acceptance.length)} condition(s)  ${mandate.title}`;

export const mandateCommand: Command = {
  name: "mandate",
  summary:
    "the human's requests as the office tracks them: the original ask, the conditions of done, the tasks it spawned and the evidence behind each condition",
  subcommands: {
    list: {
      strings: { project: "<floor>", status: "a,b" },
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = await projectIdOf(rpc, str(parsed, "project"));
        const statusRaw = str(parsed, "status");
        const status =
          statusRaw === undefined ? undefined : z.array(MandateStatus).parse(statusRaw.split(","));
        const mandates = await rpc.mandates.list(compact({ projectId, status }));
        return output(
          mandates.map((mandate) => line(mandate)),
          mandates,
        );
      },
    },
    show: {
      positionals: ["<mandate>"],
      run: async (parsed, client) => {
        const rpc = await client();
        print(pick(await rpc.mandates.list({}), parsed.positionals[0] ?? "", "mandate"));
        return undefined;
      },
    },
    abandon: {
      positionals: ["<mandate>"],
      strings: { reason: "<text>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const mandate = pick(await rpc.mandates.list({}), parsed.positionals[0] ?? "", "mandate");
        const abandoned = await rpc.mandates.abandon({
          id: mandate.id,
          ...compact({ reason: str(parsed, "reason") }),
        });
        return output([`${colour.id(abandoned.id)} ${statusColour(abandoned.status)}`], abandoned);
      },
    },
  },
};
