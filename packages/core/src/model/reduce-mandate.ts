import type { ProjectId, StoredEvent } from "@ho/protocol";
import { indexInto, type ReadModel } from "./read-model.ts";

type MandateEvent = Extract<StoredEvent, { type: `mandate.${string}` }>;

const CLOSED: ReadonlySet<string> = new Set(["fulfilled", "abandoned"]);

export function applyMandateEvent(model: ReadModel, event: MandateEvent): void {
  if (event.type === "mandate.opened") {
    const { mandate } = event.payload;
    model.mandates.set(mandate.id, mandate);
    indexInto(model.mandatesByProject, mandate.projectId, mandate.id);
    indexInto(model.tasksByMandate, mandate.id, mandate.rootTaskId);
    const root = model.tasks.get(mandate.rootTaskId);
    if (root !== undefined && root.mandateId === undefined) {
      model.tasks.set(root.id, { ...root, mandateId: mandate.id, updatedAt: event.at });
      model.revisions.tasks += 1;
    }
    return;
  }
  const mandate = model.mandates.get(event.payload.mandateId);
  if (mandate === undefined) {
    return;
  }
  const touched = { ...mandate, updatedAt: event.at };
  switch (event.type) {
    case "mandate.acceptance_stated": {
      model.mandates.set(mandate.id, { ...touched, acceptance: event.payload.acceptance });
      break;
    }
    case "mandate.evidence_recorded": {
      model.mandates.set(mandate.id, {
        ...touched,
        evidence: [...mandate.evidence, event.payload.evidence],
      });
      break;
    }
    case "mandate.artifacts_changed": {
      model.mandates.set(mandate.id, { ...touched, artifacts: event.payload.artifacts });
      break;
    }
    case "mandate.baseline_recorded": {
      model.mandates.set(mandate.id, { ...touched, baseline: event.payload.baseline });
      break;
    }
    case "mandate.status_changed": {
      const { to } = event.payload;
      model.mandates.set(mandate.id, {
        ...touched,
        status: to,
        ...(CLOSED.has(to) ? { closedAt: event.at } : {}),
      });
      break;
    }
    case "mandate.round_opened": {
      model.mandates.set(mandate.id, { ...touched, round: event.payload.round });
      break;
    }
  }
}

export function removeMandatesOf(model: ReadModel, projectId: ProjectId): void {
  for (const id of model.mandatesByProject.get(projectId) ?? []) {
    model.mandates.delete(id);
    model.tasksByMandate.delete(id);
  }
  model.mandatesByProject.delete(projectId);
}
