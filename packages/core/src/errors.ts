import type { TaskStatus } from "@ho/protocol";

/** Stable codes: the daemon maps them to RPC errors, the UI to messages, the office to emotions. */
export type DomainError =
  | {
      code: "not_found";
      entity: "project" | "agent" | "task" | "session" | "chat_message";
      id: string;
    }
  | { code: "conflict"; reason: string }
  | { code: "invalid_transition"; from: TaskStatus; to: TaskStatus };

export const notFound = (
  entity: Extract<DomainError, { code: "not_found" }>["entity"],
  id: string,
): DomainError => ({
  code: "not_found",
  entity,
  id,
});
export const conflict = (reason: string): DomainError => ({ code: "conflict", reason });
