import {
  client,
  type ClientConnection,
  type PermissionOption,
  type SessionUpdate,
  type Stream,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@ho/core";

type Listener = (update: SessionUpdate) => void;

export type OfficeConnection = {
  conn: ClientConnection;
  /** Receives every `session/update` while a prompt is running. */
  listen: (listener: Listener | null) => void;
  /** Events produced outside a prompt turn (permission decisions), drained by the turn that follows. */
  drain: () => RuntimeEvent[];
};

/** Permission prompts get the most permissive option: the sandbox, not the prompt, limits the agent. */
const pickOption = (options: readonly PermissionOption[]): PermissionOption | undefined =>
  options.find((o) => o.kind === "allow_always") ??
  options.find((o) => o.kind === "allow_once") ??
  options[0];

/** The office's side of an ACP connection: auto-approving permissions and forwarding session updates. */
export function openConnection(stream: Stream): OfficeConnection {
  let listener: Listener | null = null;
  let pending: RuntimeEvent[] = [];
  const conn = client({ name: "home-office" })
    .onRequest("session/request_permission", (cx) => {
      const option = pickOption(cx.params.options);
      pending.push({
        kind: "permission_request",
        id: cx.params.toolCall.toolCallId,
        tool: cx.params.toolCall.title ?? "tool",
        input: cx.params.toolCall.rawInput,
      });
      return option === undefined
        ? { outcome: { outcome: "cancelled" as const } }
        : { outcome: { outcome: "selected" as const, optionId: option.optionId } };
    })
    .onNotification("session/update", (cx) => {
      listener?.(cx.params.update);
    })
    .connect(stream);
  return {
    conn,
    listen: (next) => {
      listener = next;
    },
    drain: () => {
      const events = pending;
      pending = [];
      return events;
    },
  };
}
