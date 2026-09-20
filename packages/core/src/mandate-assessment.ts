import type {
  AcceptancePolicy,
  Agent,
  AgentRole,
  Evidence,
  EvidenceVerdict,
  Mandate,
  Task,
} from "@ho/protocol";
import { awaitsAnswer, membersOf, tasksOfMandate } from "./model/queries.ts";
import type { ReadModel } from "./model/read-model.ts";

export type TaskCriteria = { task: Task; indexes: number[] };

export type Assessment =
  | { kind: "waiting"; open: Task[] }
  | { kind: "stalled"; tasks: Task[]; reason: string }
  | { kind: "integrate"; tasks: Task[] }
  | { kind: "verifying"; task: Task }
  | { kind: "verify"; criteria: number[]; taskCriteria: TaskCriteria[] }
  | { kind: "failed"; criteria: number[]; taskCriteria: TaskCriteria[]; checks: boolean }
  | { kind: "fulfilled"; tasks: Task[] };

const SETTLED: ReadonlySet<Task["status"]> = new Set(["done", "cancelled"]);

const latest = (entries: readonly Evidence[]): Evidence | undefined =>
  entries.toSorted((a, b) => b.at.localeCompare(a.at))[0];

const independent = (evidence: Evidence, author: Agent["id"] | undefined): boolean =>
  (evidence.method === "review" || evidence.method === "verification") &&
  !(evidence.by.kind === "agent" && evidence.by.agentId === author);

const settles = (evidence: Evidence): boolean =>
  evidence.verdict !== "not_checked" || evidence.method === "verification";

const verdictOnTask = (
  mandate: Mandate,
  task: Task,
  index: number,
): EvidenceVerdict | undefined => {
  const { commit } = task.artifacts;
  if (commit === undefined) {
    return undefined;
  }
  return latest(
    mandate.evidence.filter(
      (entry) =>
        entry.taskId === task.id &&
        entry.criterion === index &&
        entry.commit === commit &&
        settles(entry) &&
        independent(entry, task.assigneeId),
    ),
  )?.verdict;
};

const verdictOnMandate = (mandate: Mandate, index: number): EvidenceVerdict | undefined => {
  const { commit } = mandate.artifacts;
  if (commit === undefined) {
    return undefined;
  }
  return latest(
    mandate.evidence.filter(
      (entry) =>
        entry.taskId === undefined &&
        entry.criterion === index &&
        entry.commit === commit &&
        entry.method === "verification",
    ),
  )?.verdict;
};

const checksFailed = (mandate: Mandate): boolean => {
  const { commit } = mandate.artifacts;
  return (
    commit !== undefined &&
    latest(
      mandate.evidence.filter(
        (entry) =>
          entry.taskId === undefined &&
          entry.criterion === null &&
          entry.method === "checks" &&
          entry.commit === commit,
      ),
    )?.verdict === "fail"
  );
};

const integrated = (mandate: Mandate, done: readonly Task[]): boolean => {
  const commits = done.flatMap((task) =>
    task.artifacts.commit === undefined ? [] : [task.artifacts.commit],
  );
  if (commits.length !== done.length || mandate.artifacts.commit === undefined) {
    return false;
  }
  const merged = new Set(mandate.artifacts.merged);
  return commits.length === merged.size && commits.every((commit) => merged.has(commit));
};

type Split = { missing: number[]; failed: number[] };

const split = (count: number, verdictAt: (index: number) => EvidenceVerdict | undefined): Split => {
  const outcome: Split = { missing: [], failed: [] };
  for (let index = 0; index < count; index += 1) {
    const verdict = verdictAt(index);
    if (verdict === undefined) {
      outcome.missing.push(index);
    } else if (verdict === "fail") {
      outcome.failed.push(index);
    }
  }
  return outcome;
};

const taskCriteriaOf = (
  mandate: Mandate,
  done: readonly Task[],
  pick: keyof Split,
): TaskCriteria[] =>
  done.flatMap((task) => {
    const count = task.spec?.acceptanceCriteria.length ?? 0;
    const indexes = split(count, (index) => verdictOnTask(mandate, task, index))[pick];
    return indexes.length === 0 ? [] : [{ task, indexes }];
  });

const judge = (mandate: Mandate, done: Task[], policy: AcceptancePolicy): Assessment => {
  if (policy.verify === "never") {
    return { kind: "fulfilled", tasks: done };
  }
  const whole = split(mandate.acceptance.length, (index) => verdictOnMandate(mandate, index));
  const perTask = policy.verify === "always";
  const failedTasks = perTask ? taskCriteriaOf(mandate, done, "failed") : [];
  const checks = checksFailed(mandate);
  if (whole.failed.length > 0 || failedTasks.length > 0 || checks) {
    return { kind: "failed", criteria: whole.failed, taskCriteria: failedTasks, checks };
  }
  const missingTasks = perTask ? taskCriteriaOf(mandate, done, "missing") : [];
  const wholeNeeded = perTask || mandate.acceptance.length > 0 || done.length > 1;
  if (wholeNeeded && mandate.acceptance.length === 0) {
    return { kind: "verify", criteria: [], taskCriteria: missingTasks };
  }
  if (whole.missing.length > 0 || missingTasks.length > 0) {
    return { kind: "verify", criteria: whole.missing, taskCriteria: missingTasks };
  }
  return { kind: "fulfilled", tasks: done };
};

export function assessMandate(
  model: ReadModel,
  mandate: Mandate,
  policy: AcceptancePolicy,
): Assessment {
  const tasks = tasksOfMandate(model, mandate);
  const verifying = tasks.find((task) => task.kind === "verify" && !SETTLED.has(task.status));
  if (verifying !== undefined) {
    return verifying.status === "blocked" || verifying.status === "failed"
      ? { kind: "stalled", tasks: [verifying], reason: "the verification did not finish" }
      : { kind: "verifying", task: verifying };
  }
  const deciding = tasks.find(
    (task) => task.kind === "triage" && task.source.kind === "mandate" && !SETTLED.has(task.status),
  );
  if (deciding !== undefined) {
    const undecided =
      deciding.status === "failed" || (deciding.status === "blocked" && !awaitsAnswer(deciding));
    return undecided
      ? {
          kind: "stalled",
          tasks: [deciding],
          reason: "the boss could not decide how the request continues",
        }
      : { kind: "waiting", open: [deciding] };
  }
  const work = tasks.filter((task) => task.kind === "work");
  const open = work.filter((task) => !SETTLED.has(task.status));
  const stuck = open.filter(
    (task) => task.status === "failed" || (task.status === "blocked" && !awaitsAnswer(task)),
  );
  if (stuck.length > 0) {
    return { kind: "stalled", tasks: stuck, reason: "a task is blocked or failed" };
  }
  const planning = tasks.some((task) => task.kind === "plan" && !SETTLED.has(task.status));
  if (open.length > 0 || planning || work.length === 0) {
    return { kind: "waiting", open };
  }
  const done = work.filter((task) => task.status === "done");
  if (done.length === 0) {
    return { kind: "stalled", tasks: [], reason: "every task was cancelled" };
  }
  if (!integrated(mandate, done)) {
    return { kind: "integrate", tasks: done };
  }
  return judge(mandate, done, policy);
}

const VERIFIER_ROLES: readonly AgentRole[] = ["qa", "head", "boss"];

export const verifierFor = (model: ReadModel, mandate: Mandate): Agent | undefined => {
  const authors = new Set(
    tasksOfMandate(model, mandate)
      .filter((task) => task.kind === "work")
      .flatMap((task) => (task.assigneeId === undefined ? [] : [task.assigneeId])),
  );
  const members = membersOf(model, mandate.projectId);
  for (const role of VERIFIER_ROLES) {
    const found = members.find((agent) => agent.role === role && !authors.has(agent.id));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};
