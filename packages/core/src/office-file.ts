import {
  type Agent,
  type Budgets,
  compact,
  OFFICE_SCHEMA_URL,
  type OfficeFile,
  type OfficeFileAgent,
  type Project,
} from "@ho/protocol";

const members = (value: object): Map<string, unknown> =>
  new Map(Object.entries(value).filter(([, v]) => v !== undefined));

export const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const left = members(a);
  const right = members(b);
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (!right.has(key) || !jsonEqual(value, right.get(key))) {
      return false;
    }
  }
  return true;
};

const inFileOrder = (a: Agent, b: Agent): number =>
  a.role === b.role
    ? a.name.localeCompare(b.name)
    : Number(b.role === "boss") - Number(a.role === "boss");

const sharedBudgets = (agents: readonly Agent[]): Budgets | undefined => {
  const [first] = agents;
  return first !== undefined && agents.every((a) => jsonEqual(a.budgets, first.budgets))
    ? first.budgets
    : undefined;
};

const entryFrom = (agent: Agent, shared: Budgets | undefined): OfficeFileAgent => ({
  name: agent.name,
  role: agent.role,
  gender: agent.appearance.gender,
  provider: agent.provider,
  auth: agent.auth,
  model: agent.model,
  effort: agent.effort,
  skillPack: agent.skillPack,
  ...compact({
    basePrompt: agent.basePrompt === "" ? undefined : agent.basePrompt,
    budgets: shared === undefined ? agent.budgets : undefined,
  }),
});

export function officeFileFrom(project: Project, agents: readonly Agent[]): OfficeFile {
  const roster = [...agents].toSorted(inFileOrder);
  const shared = sharedBudgets(roster);
  return {
    $schema: OFFICE_SCHEMA_URL,
    version: 1,
    name: project.name,
    defaultBranch: project.defaultBranch,
    publish: project.publish,
    intake: project.intake,
    services: project.services,
    verify: project.verify,
    ...compact({ budgets: shared }),
    agents: roster.map((agent) => entryFrom(agent, shared)),
  };
}

const mergeAgents = (
  base: readonly OfficeFileAgent[] | undefined,
  overlay: readonly OfficeFileAgent[] | undefined,
): OfficeFileAgent[] | undefined => {
  if (overlay === undefined) {
    return base === undefined ? undefined : [...base];
  }
  if (base === undefined) {
    return [...overlay];
  }
  const byName = new Map(base.map((entry) => [entry.name.toLowerCase(), entry]));
  for (const entry of overlay) {
    const key = entry.name.toLowerCase();
    const found = byName.get(key);
    byName.set(key, found === undefined ? entry : { ...found, ...compact(entry) });
  }
  return [...byName.values()];
};

export function mergeOfficeFile(base: OfficeFile, overlay: OfficeFile): OfficeFile {
  const merged: OfficeFile = { ...base, ...compact(overlay) };
  const agents = mergeAgents(base.agents, overlay.agents);
  return agents === undefined ? merged : { ...merged, agents };
}
