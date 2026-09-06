import { AgentRole, EffortLevel, Gender } from "@ho/protocol";
import { parse, required, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { findAgent, findProject } from "./lookup.ts";
import { subcommand } from "./usage.ts";

/** `--project` may repeat; parseArgs keeps only the last value, so repeats are collected by hand. */
const splitProjects = (argv: readonly string[]): { projects: string[]; remaining: string[] } => {
  const projects: string[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--project" && next !== undefined) {
      projects.push(next);
      i += 1;
    } else if (arg !== undefined) {
      remaining.push(arg);
    }
  }
  return { projects, remaining };
};

export async function agent(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "agent");
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        for (const a of await client.agents.list()) {
          line(
            `${a.id}  ${a.name}  ${a.role}  ${a.provider}/${a.model}@${a.effort}  projects=${String(a.projectIds.length)}`,
          );
        }
        return;
      }
      case "add": {
        const { projects, remaining } = splitProjects(rest);
        const parsed = parse(remaining, ["role", "model", "effort", "gender", "sprite", "prompt"]);
        const name = parsed.positionals[0];
        if (name === undefined) {
          throw new Error("agent name is required");
        }
        const projectIds = await Promise.all(
          projects.map(async (ref) => (await findProject(client, ref)).id),
        );
        const prompt = str(parsed, "prompt");
        print(
          await client.agents.create({
            name,
            role: AgentRole.parse(required(parsed, "role")),
            appearance: {
              spriteSet: str(parsed, "sprite") ?? "agent-a",
              gender: Gender.parse(str(parsed, "gender") ?? "neutral"),
            },
            provider: "claude-code",
            model: str(parsed, "model") ?? "sonnet",
            effort: EffortLevel.parse(str(parsed, "effort") ?? "medium"),
            ...(prompt === undefined ? {} : { basePrompt: prompt }),
            projectIds,
          }),
        );
        return;
      }
      case "rm": {
        const ref = rest[0];
        if (ref === undefined) {
          throw new Error("agent reference is required");
        }
        print(await client.agents.remove({ id: (await findAgent(client, ref)).id }));
        return;
      }
      default: {
        throw new Error(`unknown agent command "${sub}"`);
      }
    }
  });
}
