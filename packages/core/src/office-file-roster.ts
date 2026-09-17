import {
  type Agent,
  Budgets,
  describeDomainError,
  isSessionActive,
  type NewEvent,
  type OfficeFileAgent,
  type Project,
  type ProjectId,
} from "@ho/protocol";
import { isTerminal } from "./commands/tasks.ts";
import { membersOf, sessionsOfAgent, tasksOf } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";
import { jsonEqual } from "./office-file.ts";
import { defaultChoice, validateChoice } from "./providers.ts";
import type { CommandContext } from "./result.ts";

export type Plan = { events: NewEvent[]; changes: string[]; problems: string[] };

const budgetsFor = (
  entry: OfficeFileAgent,
  floor: Budgets | undefined,
  current: Agent | undefined,
): Budgets => entry.budgets ?? floor ?? current?.budgets ?? Budgets.parse({});

const hire = (
  entry: OfficeFileAgent,
  projectId: ProjectId,
  budgets: Budgets,
  ctx: CommandContext,
): Agent => {
  const fallback = defaultChoice(entry.provider, entry.role);
  return {
    id: ctx.ids.agent(),
    name: entry.name,
    role: entry.role,
    appearance: { gender: entry.gender ?? "neutral" },
    provider: entry.provider,
    auth: entry.auth ?? fallback.auth,
    model: entry.model ?? fallback.model,
    effort: entry.effort ?? fallback.effort,
    basePrompt: entry.basePrompt ?? "",
    skillPack: entry.skillPack ?? "none",
    budgets,
    projectId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
};

const reshape = (current: Agent, entry: OfficeFileAgent, budgets: Budgets): Agent => {
  const base =
    entry.provider === current.provider
      ? current
      : { ...current, ...defaultChoice(entry.provider, entry.role) };
  return {
    ...base,
    name: entry.name,
    role: entry.role,
    appearance: { gender: entry.gender ?? current.appearance.gender },
    provider: entry.provider,
    auth: entry.auth ?? base.auth,
    model: entry.model ?? base.model,
    effort: entry.effort ?? base.effort,
    basePrompt: entry.basePrompt ?? current.basePrompt,
    skillPack: entry.skillPack ?? current.skillPack,
    budgets,
  };
};

const PLAIN_FIELDS = ["name", "role", "provider", "auth", "model", "effort", "skillPack"] as const;

const agentDiff = (before: Agent, after: Agent): string[] => {
  const changed = PLAIN_FIELDS.filter((field) => before[field] !== after[field]).map(
    (field) => `${field} ${before[field]} → ${after[field]}`,
  );
  if (before.appearance.gender !== after.appearance.gender) {
    changed.push(`gender ${before.appearance.gender} → ${after.appearance.gender}`);
  }
  if (before.basePrompt !== after.basePrompt) {
    changed.push("base prompt");
  }
  if (!jsonEqual(before.budgets, after.budgets)) {
    changed.push("budgets");
  }
  return changed;
};

const emitUpdate = (current: Agent, next: Agent, ctx: CommandContext, plan: Plan): void => {
  const choice = validateChoice(next);
  if (!choice.ok) {
    plan.problems.push(`${current.name}: ${describeDomainError(choice.error)}`);
    return;
  }
  const diff = agentDiff(current, next);
  if (diff.length === 0) {
    return;
  }
  plan.changes.push(`~ ${current.name}: ${diff.join(", ")}`);
  plan.events.push({
    type: "agent.updated",
    actor: ctx.actor,
    payload: { agent: { ...next, updatedAt: ctx.now } },
  });
};

const emitHire = (agent: Agent, ctx: CommandContext, plan: Plan): void => {
  const choice = validateChoice(agent);
  if (!choice.ok) {
    plan.problems.push(`${agent.name}: ${describeDomainError(choice.error)}`);
    return;
  }
  plan.changes.push(`+ ${agent.name} (${agent.role}, ${agent.provider}/${agent.model})`);
  plan.events.push({ type: "agent.created", actor: ctx.actor, payload: { agent } });
};

function release(model: ReadModel, agent: Agent, ctx: CommandContext, plan: Plan): boolean {
  if (sessionsOfAgent(model, agent.id).some((s) => isSessionActive(s.state))) {
    plan.problems.push(`${agent.name} is not in the file but is mid-session; left on the floor`);
    return false;
  }
  const busy = tasksOf(model, agent.projectId).filter(
    (t) => (t.assigneeId === agent.id || t.reviewerId === agent.id) && !isTerminal(t.status),
  ).length;
  if (busy > 0) {
    plan.problems.push(
      `${agent.name} is not in the file but holds ${String(busy)} open task(s); left on the floor`,
    );
    return false;
  }
  plan.changes.push(`- ${agent.name}`);
  plan.events.push({ type: "agent.removed", actor: ctx.actor, payload: { agentId: agent.id } });
  return true;
}

const withoutRepeats = (entries: readonly OfficeFileAgent[], plan: Plan): OfficeFileAgent[] => {
  const seen = new Set<string>();
  const kept: OfficeFileAgent[] = [];
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) {
      plan.problems.push(`the file names "${entry.name}" twice; the first one is applied`);
      continue;
    }
    seen.add(key);
    kept.push(entry);
  }
  return kept;
};

const bossEntryOf = (
  wanted: readonly OfficeFileAgent[],
  plan: Plan,
): OfficeFileAgent | undefined => {
  const bosses = wanted.filter((entry) => entry.role === "boss");
  const [first] = bosses;
  if (bosses.length > 1 && first !== undefined) {
    plan.problems.push(
      `the file names ${String(bosses.length)} bosses; a floor has one, so only "${first.name}" is applied`,
    );
  }
  return first;
};

function planBoss(
  boss: Agent,
  entry: OfficeFileAgent,
  budgets: Budgets | undefined,
  taken: ReadonlySet<string>,
  ctx: CommandContext,
  plan: Plan,
): string {
  const blocked =
    entry.name.toLowerCase() !== boss.name.toLowerCase() && taken.has(entry.name.toLowerCase());
  if (blocked) {
    plan.problems.push(
      `the boss cannot be renamed to "${entry.name}"; someone on this floor already answers to it`,
    );
  }
  const asked = blocked ? { ...entry, name: boss.name } : entry;
  const next = reshape(boss, asked, budgetsFor(asked, budgets, boss));
  emitUpdate(boss, next, ctx, plan);
  return next.name;
}

export function planRoster(
  model: ReadModel,
  project: Project,
  entries: readonly OfficeFileAgent[],
  floorBudgets: Budgets | undefined,
  ctx: CommandContext,
  plan: Plan,
): void {
  const wanted = withoutRepeats(entries, plan);
  const named = new Set(wanted.map((entry) => entry.name.toLowerCase()));
  const bossEntry = bossEntryOf(wanted, plan);
  const roster = membersOf(model, project.id);
  const boss = roster.find((agent) => agent.role === "boss");
  const staff = roster.filter((agent) => agent.id !== boss?.id);
  const taken = new Set<string>(boss === undefined ? [] : [boss.name.toLowerCase()]);
  for (const agent of staff) {
    if (named.has(agent.name.toLowerCase()) || !release(model, agent, ctx, plan)) {
      taken.add(agent.name.toLowerCase());
    }
  }
  if (boss !== undefined && bossEntry !== undefined) {
    taken.delete(boss.name.toLowerCase());
    taken.add(planBoss(boss, bossEntry, floorBudgets, taken, ctx, plan).toLowerCase());
  }
  const byName = new Map(staff.map((agent) => [agent.name.toLowerCase(), agent]));
  for (const entry of wanted) {
    if (entry.role === "boss" && (entry !== bossEntry || boss !== undefined)) {
      continue;
    }
    const key = entry.name.toLowerCase();
    const current = byName.get(key);
    if (current !== undefined) {
      const next = reshape(current, entry, budgetsFor(entry, floorBudgets, current));
      emitUpdate(current, next, ctx, plan);
      continue;
    }
    if (taken.has(key)) {
      plan.problems.push(
        `"${entry.name}" could not be hired; that name is still taken on this floor`,
      );
      continue;
    }
    taken.add(key);
    emitHire(hire(entry, project.id, budgetsFor(entry, floorBudgets, undefined), ctx), ctx, plan);
  }
}
