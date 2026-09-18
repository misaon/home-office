import { defaultChoice, rolePack } from "@ho/core";
import {
  AgentRole,
  AuthKind,
  type Budgets,
  compact,
  EffortLevel,
  Gender,
  ProviderId,
} from "@ho/protocol";
import { positive, required, str } from "../flags.ts";
import { type Command, output, type Parsed } from "../cli.ts";
import { colour } from "../output.ts";
import { findAgent, findProject, projectFor, projectIdOf, projectNames } from "./lookup.ts";

const CHOICE = {
  provider: "claude-code|opencode|gemini-cli|codex",
  auth: "subscription|api-key|none",
  model: "<id>",
  effort: "low|medium|high|xhigh|max",
  prompt: "<text>",
  skills: "boss|secretary|analyst|backend|frontend|devops|qa|security|head|developer|none",
  gender: "female|male|neutral",
};

const BUDGET = {
  "max-turns": "<n> tool turns per task",
  "max-minutes": "<n> wall-clock minutes per session",
  "max-sessions": "<n> concurrent sessions",
};

const budgetPatch = (parsed: Parsed): { budgets: Partial<Budgets> } | Record<string, never> => {
  const next = compact({
    maxTurnsPerTask: positive(parsed, "max-turns"),
    maxWallMinutes: positive(parsed, "max-minutes"),
    maxConcurrentSessions: positive(parsed, "max-sessions"),
  });
  return Object.keys(next).length === 0 ? {} : { budgets: next };
};

export const agentCommand: Command = {
  name: "agent",
  summary:
    "the staff of a floor; defaults are the only floor, the provider's model and auth, and the role's skill pack",
  subcommands: {
    list: {
      strings: { project: "<floor>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const projectId = await projectIdOf(rpc, str(parsed, "project"));
        const names = await projectNames(rpc);
        const agents = await rpc.agents.list(compact({ projectId }));
        return output(
          agents.map(
            (a) =>
              `${a.id}  ${a.name}  ${a.role}  ${a.provider}/${a.model}@${a.effort} (${a.auth})  skills=${a.skillPack}  floor=${names.get(a.projectId) ?? a.projectId}`,
          ),
          agents,
        );
      },
    },
    add: {
      positionals: ["<name>"],
      strings: {
        role: "secretary|analyst|backend|frontend|devops|qa|security|head|developer",
        project: "<floor>",
        ...CHOICE,
      },
      required: ["role"],
      run: async (parsed, client) => {
        const rpc = await client();
        const role = AgentRole.parse(required(parsed, "role"));
        if (role === "boss") {
          throw new Error(
            "every floor already has its boss; hire staff: secretary, analyst, backend, frontend, devops, qa, security, head or developer",
          );
        }
        const project = await projectFor(rpc, str(parsed, "project"));
        const provider = ProviderId.parse(str(parsed, "provider") ?? "claude-code");
        const defaults = defaultChoice(provider, role);
        const created = await rpc.agents.create({
          name: parsed.positionals[0] ?? "",
          role,
          projectId: project.id,
          appearance: { gender: Gender.parse(str(parsed, "gender") ?? "neutral") },
          provider,
          model: str(parsed, "model") ?? defaults.model,
          effort: EffortLevel.optional().parse(str(parsed, "effort")) ?? defaults.effort,
          skillPack: str(parsed, "skills") ?? rolePack(role),
          ...compact({
            auth: AuthKind.optional().parse(str(parsed, "auth")),
            basePrompt: str(parsed, "prompt"),
          }),
        });
        return output(
          [
            `hired ${colour.bold(created.name)} (${created.role}) on ${project.name}: ${created.provider}/${created.model}@${created.effort}`,
          ],
          created,
        );
      },
    },
    set: {
      positionals: ["<agent>"],
      strings: { project: "<floor>", name: "<name>", ...CHOICE, ...BUDGET },
      run: async (parsed, client) => {
        const rpc = await client();
        const current = await findAgent(
          rpc,
          parsed.positionals[0] ?? "",
          await projectIdOf(rpc, str(parsed, "project")),
        );
        const gender = Gender.optional().parse(str(parsed, "gender"));
        const updated = await rpc.agents.update({
          id: current.id,
          patch: compact({
            name: str(parsed, "name"),
            provider: ProviderId.optional().parse(str(parsed, "provider")),
            auth: AuthKind.optional().parse(str(parsed, "auth")),
            model: str(parsed, "model"),
            effort: EffortLevel.optional().parse(str(parsed, "effort")),
            appearance: gender === undefined ? undefined : { gender },
            basePrompt: str(parsed, "prompt"),
            skillPack: str(parsed, "skills"),
            ...budgetPatch(parsed),
          }),
        });
        return output(
          [
            `${colour.bold(updated.name)}: ${updated.provider}/${updated.model}@${updated.effort}, skills ${updated.skillPack}`,
            `budgets: ${String(updated.budgets.maxTurnsPerTask)} turns/task, ${String(updated.budgets.maxWallMinutes)} min/session, ${String(updated.budgets.maxConcurrentSessions)} concurrent`,
          ],
          updated,
        );
      },
    },
    copy: {
      positionals: ["<agent>"],
      strings: { project: "<floor>", from: "<floor>", name: "<name>" },
      required: ["project"],
      run: async (parsed, client) => {
        const rpc = await client();
        const source = await findAgent(
          rpc,
          parsed.positionals[0] ?? "",
          await projectIdOf(rpc, str(parsed, "from")),
        );
        const target = await findProject(rpc, required(parsed, "project"));
        const copy = await rpc.agents.copy({
          id: source.id,
          projectId: target.id,
          ...compact({ name: str(parsed, "name") }),
        });
        return output([`copied ${colour.bold(copy.name)} to ${target.name}`], copy);
      },
    },
    rm: {
      positionals: ["<agent>"],
      strings: { project: "<floor>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const found = await findAgent(
          rpc,
          parsed.positionals[0] ?? "",
          await projectIdOf(rpc, str(parsed, "project")),
        );
        const removed = await rpc.agents.remove({ id: found.id });
        return output([`dismissed ${colour.bold(found.name)}`], removed);
      },
    },
  },
};
