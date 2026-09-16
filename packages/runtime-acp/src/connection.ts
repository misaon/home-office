import {
  client,
  type ClientConnection,
  type PermissionOption,
  type SessionUpdate,
  type Stream,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@ho/protocol";

export type OfficeConnection = {
  conn: ClientConnection;
  listen: (listener: ((update: SessionUpdate) => void) | null) => void;
  onPermission: (listener: ((event: RuntimeEvent) => void) | null) => void;
};

const pickOption = (options: readonly PermissionOption[]): PermissionOption | undefined =>
  options.find((o) => o.kind === "allow_always") ??
  options.find((o) => o.kind === "allow_once") ??
  options[0];

export function openConnection(stream: Stream): OfficeConnection {
  let listener: ((update: SessionUpdate) => void) | null = null;
  let permission: ((event: RuntimeEvent) => void) | null = null;
  const conn = client({ name: "home-office" })
    .onRequest("session/request_permission", (cx) => {
      const option = pickOption(cx.params.options);
      permission?.({
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
    onPermission: (next) => {
      permission = next;
    },
  };
}
