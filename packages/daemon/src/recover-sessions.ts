import { activeSessions, endSession, type SandboxProvider, transitionTask } from "@ho/core";
import { LABELS } from "./images.ts";
import type { Office } from "./office.ts";

export async function recoverSessions(office: Office, provider: SandboxProvider): Promise<void> {
  const actor = { kind: "system" } as const;
  const reason =
    "daemon restarted before the session finished; inspect the task branch and resume explicitly";
  const active = activeSessions(office.model);
  if (active.length === 0) {
    return;
  }
  const inventory = await provider.inventory({
    [LABELS.managed]: "true",
    [LABELS.kind]: "session",
  });
  for (const session of active) {
    for (const container of inventory.containers.filter((item) => item.sessionId === session.id)) {
      const handle = { id: container.name, name: container.name };
      await provider.stop(handle, 2);
      await provider.remove(handle);
    }
    await office.execute(actor, (model, context) =>
      endSession(model, { sessionId: session.id, state: "failed", reason }, context),
    );
    const task = office.model.tasks.get(session.taskId);
    if (
      task?.status === "in_progress" ||
      task?.status === "review" ||
      task?.status === "assigned"
    ) {
      await office.execute(actor, (model, context) =>
        transitionTask(model, { id: session.taskId, to: "blocked", reason }, context),
      );
    }
  }
}
