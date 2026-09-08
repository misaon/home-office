import {
  AgentRole,
  AuthKind,
  compact,
  EffortLevel,
  Gender,
  type ProjectId,
  ProviderId,
  PROVIDERS,
} from "@ho/protocol";
import { parse, required, str } from "../args.ts";
import { type HoClient, withClient } from "../client.ts";
import { subcommand } from "./help.ts";
import { findAgent, findProject, onlyProject } from "./lookup.ts";
import { line, print } from "../output.ts";

/** `--project` narrows an agent lookup to one floor (names repeat across floors: every floor has an Andrew). */
const floorOf = async (
  client: HoClient,
  ref: string | undefined,
): Promise<ProjectId | undefined> =>
  ref === undefined ? undefined : (await findProject(client, ref)).id;

async function listAgents(client: HoClient, argv: readonly string[]): Promise<void> {
  const parsed = parse(argv, ["project"]);
  const projectId = await floorOf(client, str(parsed, "project"));
  const projects = new Map((await client.projects.list()).map((p) => [p.id, p.name]));
  for (const a of await client.agents.list(compact({ projectId }))) {
    line(
      `${a.id}  ${a.name}  ${a.role}  ${a.provider}/${a.model}@${a.effort} (${a.auth})  skills=${a.skillPack}  floor=${projects.get(a.projectId) ?? a.projectId}`,
    );
  }
}

async function addAgent(client: HoClient, argv: readonly string[]): Promise<void> {
  const parsed = parse(argv, [
    "role",
    "project",
    "provider",
    "auth",
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
  if (role === "boss") {
    throw new Error("every floor already has its boss (Andrew); hire workers, reviewers or clerks");
  }
  const projectRef = str(parsed, "project");
  const project =
    projectRef === undefined ? await onlyProject(client) : await findProject(client, projectRef);
  // Skill packs ship in the agent image per role; `--skills none` opts out.
  const skillPack = str(parsed, "skills") ?? (role === "clerk" ? "none" : role);
  const prompt = str(parsed, "prompt");
  const provider = ProviderId.parse(str(parsed, "provider") ?? "claude-code");
  const catalog = PROVIDERS[provider];
  const auth = str(parsed, "auth");
  print(
    await client.agents.create({
      name,
      role,
      projectId: project.id,
      appearance: {
        spriteSet: str(parsed, "sprite") ?? "agent-a",
        gender: Gender.parse(str(parsed, "gender") ?? "neutral"),
      },
      provider,
      model: str(parsed, "model") ?? catalog.defaultModel,
      effort: EffortLevel.parse(
        str(parsed, "effort") ?? (catalog.effortLevels.includes("medium") ? "medium" : "low"),
      ),
      skillPack,
      ...compact({ auth: AuthKind.optional().parse(auth), basePrompt: prompt }),
    }),
  );
}

async function setAgent(client: HoClient, argv: readonly string[]): Promise<void> {
  const parsed = parse(argv, [
    "project",
    "provider",
    "auth",
    "model",
    "effort",
    "sprite",
    "prompt",
    "skills",
    "name",
  ]);
  const ref = parsed.positionals[0];
  if (ref === undefined) {
    throw new Error("agent reference is required");
  }
  const current = await findAgent(client, ref, await floorOf(client, str(parsed, "project")));
  const model = str(parsed, "model");
  const effort = str(parsed, "effort");
  const sprite = str(parsed, "sprite");
  const prompt = str(parsed, "prompt");
  const skills = str(parsed, "skills");
  const provider = str(parsed, "provider");
  const auth = str(parsed, "auth");
  const name = str(parsed, "name");
  print(
    await client.agents.update({
      id: current.id,
      patch: compact({
        name,
        provider: ProviderId.optional().parse(provider),
        auth: AuthKind.optional().parse(auth),
        model,
        effort: EffortLevel.optional().parse(effort),
        appearance: sprite === undefined ? undefined : { ...current.appearance, spriteSet: sprite },
        basePrompt: prompt,
        skillPack: skills,
      }),
    }),
  );
}

/** The same character on another floor: `--from` picks the source floor when the name is not unique. */
async function copyAgent(client: HoClient, argv: readonly string[]): Promise<void> {
  const parsed = parse(argv, ["project", "from", "name"]);
  const ref = parsed.positionals[0];
  if (ref === undefined) {
    throw new Error("agent reference is required");
  }
  const source = await findAgent(client, ref, await floorOf(client, str(parsed, "from")));
  const target = await findProject(client, required(parsed, "project"));
  const name = str(parsed, "name");
  print(
    await client.agents.copy({
      id: source.id,
      projectId: target.id,
      ...compact({ name }),
    }),
  );
}

async function removeAgent(client: HoClient, argv: readonly string[]): Promise<void> {
  const parsed = parse(argv, ["project"]);
  const ref = parsed.positionals[0];
  if (ref === undefined) {
    throw new Error("agent reference is required");
  }
  const found = await findAgent(client, ref, await floorOf(client, str(parsed, "project")));
  print(await client.agents.remove({ id: found.id }));
}

export async function agent(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "agent");
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        await listAgents(client, rest);
        return;
      }
      case "add": {
        await addAgent(client, rest);
        return;
      }
      case "set": {
        await setAgent(client, rest);
        return;
      }
      case "copy": {
        await copyAgent(client, rest);
        return;
      }
      case "rm": {
        await removeAgent(client, rest);
        return;
      }
      default: {
        throw new Error(`unknown agent command "${sub}"`);
      }
    }
  });
}
