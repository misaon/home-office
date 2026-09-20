import { activeSessions } from "@ho/core";
import { errorMessage, type ResourceInventory, type SessionId, type TaskId } from "@ho/protocol";
import { LABELS } from "./labels.ts";
import type { SessionDeps } from "./sessions.ts";

const RESTART_REASON =
  "daemon restarted before the session finished; inspect the task branch and resume explicitly";
const INVENTORY_ATTEMPTS = 3;
const INVENTORY_RETRY_MS = 2000;

async function readInventory(deps: SessionDeps): Promise<ResourceInventory["containers"] | null> {
  const { provider, log } = deps;
  for (let attempt = 1; attempt <= INVENTORY_ATTEMPTS; attempt += 1) {
    try {
      return await provider.containers({ [LABELS.managed]: "true" });
    } catch (error) {
      log.warn(
        { attempt, of: INVENTORY_ATTEMPTS, err: errorMessage(error) },
        "docker did not answer during recovery",
      );
      if (attempt < INVENTORY_ATTEMPTS) {
        await Bun.sleep(INVENTORY_RETRY_MS);
      }
    }
  }
  return null;
}

export async function recoverSessions(
  deps: SessionDeps,
  end: (sessionId: SessionId, reason: string) => Promise<unknown>,
  block: (taskId: TaskId, reason: string) => Promise<void>,
): Promise<void> {
  const { office, provider, log } = deps;
  const active = activeSessions(office.model);
  if (active.length === 0) {
    return;
  }
  const inventory = await readInventory(deps);
  if (inventory === null) {
    log.warn(
      { sessions: active.map((session) => session.id) },
      "docker stayed silent; the sessions are closed on record and gc stops their containers once it answers",
    );
  }
  const abandoned = (inventory ?? []).filter(
    (item) => item.kind === "session" || item.kind === "engine",
  );
  for (const session of active) {
    const containers = abandoned.filter((item) => item.sessionId === session.id);
    for (const container of containers) {
      const handle = { id: container.name, name: container.name };
      await provider.stop(handle, 2).catch(() => null);
      await provider.remove(handle).catch(() => null);
    }
    log.info(
      {
        sessionId: session.id,
        taskId: session.taskId,
        state: session.state,
        containers: containers.map((item) => item.name),
        reconciled: inventory !== null,
      },
      "session abandoned by a daemon restart",
    );
    const reason =
      inventory === null
        ? `${RESTART_REASON}; its containers could not be listed and are removed by gc`
        : RESTART_REASON;
    await end(session.id, reason);
    await block(session.taskId, reason);
  }
}
