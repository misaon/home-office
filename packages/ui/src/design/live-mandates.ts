import { threadOfTask } from "@ho/core";
import { t } from "i18next";
import {
  type Actor,
  type Evidence,
  isMandateOpen,
  type Mandate,
  type ProjectId,
  type Task,
} from "@ho/protocol";
import { type Snapshot, useUi } from "../store.ts";
import { clock } from "./clock.ts";
import type { CriterionEvidence, Request, ThreadPick } from "./data.ts";

const latest = (entries: readonly Evidence[]): Evidence | undefined =>
  entries.toSorted((a, b) => b.at.localeCompare(a.at))[0];

const nameOf = (snapshot: Snapshot, actor: Actor): string => {
  if (actor.kind === "agent") {
    return snapshot.agents.get(actor.agentId)?.name ?? t("chat.colleague");
  }
  return actor.kind === "human" ? t("mandate.byHuman") : t("mandate.byOffice");
};

const NONE: CriterionEvidence = {
  mark: "open",
  by: "",
  method: "",
  proof: "",
  fidelity: null,
  blocker: null,
  files: [],
};

function evidenceFor(
  snapshot: Snapshot,
  mandate: Mandate,
  taskId: Task["id"] | undefined,
  index: number,
  commit: string | undefined,
): CriterionEvidence {
  if (commit === undefined) {
    return NONE;
  }
  const entries = mandate.evidence.filter(
    (entry) => entry.taskId === taskId && entry.criterion === index && entry.commit === commit,
  );
  const judged = latest(
    entries.filter((entry) => entry.method !== "author" && entry.verdict !== "not_checked"),
  );
  if (judged !== undefined) {
    return {
      mark: judged.verdict === "pass" ? "pass" : "fail",
      by: nameOf(snapshot, judged.by),
      method: judged.method,
      proof: judged.proof,
      fidelity: judged.fidelity,
      blocker: judged.blocker ?? null,
      files: judged.files,
    };
  }
  const claimed = latest(entries.filter((entry) => entry.method === "author"));
  return claimed === undefined
    ? NONE
    : {
        mark: "claimed",
        by: nameOf(snapshot, claimed.by),
        method: "author",
        proof: claimed.proof,
        fidelity: claimed.fidelity,
        blocker: claimed.blocker ?? null,
        files: claimed.files,
      };
}

export const cardEvidence = (snapshot: Snapshot, task: Task): CriterionEvidence[] => {
  const mandate = task.mandateId === undefined ? undefined : snapshot.mandates.get(task.mandateId);
  const criteria = task.spec?.acceptanceCriteria ?? [];
  return mandate === undefined
    ? criteria.map(() => NONE)
    : criteria.map((_, index) =>
        evidenceFor(snapshot, mandate, task.id, index, task.artifacts.commit),
      );
};

const tasksOf = (snapshot: Snapshot, mandate: Mandate): Task[] =>
  [...snapshot.tasks.values()]
    .filter((task) => task.mandateId === mandate.id && task.id !== mandate.rootTaskId)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));

function requestOf(snapshot: Snapshot, mandate: Mandate): Request {
  const conditions = mandate.acceptance.map((criterion, index) => ({
    text: criterion.text,
    evidence: evidenceFor(snapshot, mandate, undefined, index, mandate.artifacts.commit),
  }));
  return {
    id: mandate.id,
    title: mandate.title,
    request: mandate.request,
    status: mandate.status,
    round: mandate.round,
    open: isMandateOpen(mandate.status),
    progress: {
      done: conditions.filter((condition) => condition.evidence.mark === "pass").length,
      total: conditions.length,
    },
    conditions,
    tasks: tasksOf(snapshot, mandate).map((task) => ({
      id: task.id,
      title: task.title,
      kind: task.kind === "work" ? "code" : task.kind,
      status: task.status,
      who: task.assigneeId === undefined ? "" : (snapshot.agents.get(task.assigneeId)?.name ?? ""),
    })),
    prUrl: mandate.artifacts.prUrl ?? null,
    branch: mandate.artifacts.branch ?? null,
    when: clock(mandate.updatedAt),
  };
}

export function useThreadRequest(floorId: ProjectId, thread: ThreadPick | "new"): Request | null {
  const snapshot = useUi((s) => s.snapshot);
  const [newest] = [...snapshot.mandates.values()]
    .filter((mandate) => {
      const root = snapshot.tasks.get(mandate.rootTaskId);
      return (
        mandate.projectId === floorId &&
        root !== undefined &&
        (threadOfTask(snapshot, root) ?? "main") === thread
      );
    })
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  return newest === undefined ? null : requestOf(snapshot, newest);
}
