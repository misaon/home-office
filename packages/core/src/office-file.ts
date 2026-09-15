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

/** Structural equality over parsed JSON, so an absent key and an `undefined` one compare the same. */
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

// ---- export -------------------------------------------------------------------------------------

/** The boss opens the file, the staff follow in name order, so two exports of one floor agree. */
const inFileOrder = (a: Agent, b: Agent): number =>
  a.role === b.role
    ? a.name.localeCompare(b.name)
    : Number(b.role === "boss") - Number(a.role === "boss");

/** The budgets every colleague shares, which the file then states once; none when they differ. */
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

/**
 * The floor written out as its repository would carry it. Nothing derived from the event log travels:
 * no ids, no timestamps, no repository (the file is inside the repository it describes).
 * `applyOfficeFile` of an exported file produces no events, which is what makes the round trip safe.
 */
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
    ...compact({ budgets: shared }),
    agents: roster.map((agent) => entryFrom(agent, shared)),
  };
}

// ---- the machine-local overlay ------------------------------------------------------------------

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

/**
 * `.ho/config.local.json` layered over the committed `.ho/config.json`: the overlay wins where it
 * speaks, and its colleagues are matched into the committed ones by name so one machine can change a
 * single agent's provider without restating the floor.
 */
export function mergeOfficeFile(base: OfficeFile, overlay: OfficeFile): OfficeFile {
  const merged: OfficeFile = { ...base, ...compact(overlay) };
  const agents = mergeAgents(base.agents, overlay.agents);
  return agents === undefined ? merged : { ...merged, agents };
}
