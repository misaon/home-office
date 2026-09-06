import { AgentRole, EffortLevel, Gender } from "@ho/protocol";
import { parse, required, str } from "../args.ts";
import { withClient } from "../client.ts";
import { subcommand } from "./help.ts";
import { findAgent, findProject } from "./lookup.ts";
import { line, print } from "../output.ts";

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
            `${a.id}  ${a.name}  ${a.role}  ${a.provider}/${a.model}@${a.effort}  skills=${a.skillPack}  projects=${String(a.projectIds.length)}`,
          );
        }
        return;
      }
      case "add": {
        const { projects, remaining } = splitProjects(rest);
        const parsed = parse(remaining, [
          "role",
          "model",
          "effort",
          "gender",
          "sprite",
          "prompt",
          "skills",
        ]);
        const name = parsed.positionals[0];
        if (name === undefined) {
          throw new Error("agent name is required");
        }
        const role = AgentRole.parse(required(parsed, "role"));
        // Skill packs ship in the agent image per role; `--skills none` opts out.
        const skillPack = str(parsed, "skills") ?? (role === "clerk" ? "none" : role);
        const projectIds = await Promise.all(
          projects.map(async (ref) => (await findProject(client, ref)).id),
        );
        const prompt = str(parsed, "prompt");
        print(
          await client.agents.create({
            name,
            role,
            appearance: {
              spriteSet: str(parsed, "sprite") ?? "agent-a",
              gender: Gender.parse(str(parsed, "gender") ?? "neutral"),
            },
            provider: "claude-code",
            model: str(parsed, "model") ?? "sonnet",
            effort: EffortLevel.parse(str(parsed, "effort") ?? "medium"),
            ...(prompt === undefined ? {} : { basePrompt: prompt }),
            skillPack,
            projectIds,
          }),
        );
        return;
      }
      case "set": {
        const { projects, remaining } = splitProjects(rest);
        const parsed = parse(remaining, ["model", "effort", "sprite", "prompt", "skills"]);
        const ref = parsed.positionals[0];
        if (ref === undefined) {
          throw new Error("agent reference is required");
        }
        const current = await findAgent(client, ref);
        const projectIds = await Promise.all(
          projects.map(async (p) => (await findProject(client, p)).id),
        );
        const model = str(parsed, "model");
        const effort = str(parsed, "effort");
        const sprite = str(parsed, "sprite");
        const prompt = str(parsed, "prompt");
        const skills = str(parsed, "skills");
        print(
          await client.agents.update({
            id: current.id,
            patch: {
              ...(model === undefined ? {} : { model }),
              ...(effort === undefined ? {} : { effort: EffortLevel.parse(effort) }),
              ...(sprite === undefined
                ? {}
                : { appearance: { ...current.appearance, spriteSet: sprite } }),
              ...(prompt === undefined ? {} : { basePrompt: prompt }),
              ...(skills === undefined ? {} : { skillPack: skills }),
              // `--project` lists the full membership; repeat it for every project the agent keeps.
              ...(projects.length === 0 ? {} : { projectIds }),
            },
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
