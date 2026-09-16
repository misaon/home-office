import { activeSessions } from "@ho/core";
import { errorMessage, type SessionId, type TaskId } from "@ho/protocol";
import { LABELS } from "./labels.ts";
import type { SessionDeps } from "./sessions.ts";

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
  const inventory = await provider
    .inventory({ [LABELS.managed]: "true" })
    .catch((error: unknown) => {
      log.warn(
        { err: errorMessage(error) },
        "docker did not answer; abandoned containers are left to gc",
      );
      return null;
    });
  const abandoned = (inventory?.containers ?? []).filter(
    (item) => item.kind === "session" || item.kind === "engine",
  );
  for (const session of active) {
    for (const container of abandoned.filter((item) => item.sessionId === session.id)) {
      const handle = { id: container.name, name: container.name };
      await provider.stop(handle, 2).catch(() => null);
      await provider.remove(handle).catch(() => null);
    }
    await end(session.id, RESTART_REASON);
    await block(session.taskId, RESTART_REASON);
  }
}

const RESTART_REASON =
  "daemon restarted before the session finished; inspect the task branch and resume explicitly";
