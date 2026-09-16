import { HANDSHAKE_TIMEOUT_MS, waitForOpen } from "@ho/core";
import { type Contract, TOKEN_STORAGE_KEY } from "@ho/protocol";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";

export type Client = ContractRouterClient<Contract>;

const PROTOCOL_PREFIX = "ho.bearer.";

export function resolveToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
  const fromHash = fragment.get("token");
  if (fromHash !== null && fromHash !== "") {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fromHash);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

let current: Client | null = null;
let bearer: string | null = null;

export function requireToken(): string {
  if (bearer === null) {
    throw new Error("daemon is offline");
  }
  return bearer;
}

export function requireClient(): Client {
  if (current === null) {
    throw new Error("daemon is offline");
  }
  return current;
}

export async function connect(token: string): Promise<{ client: Client; socket: WebSocket }> {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${window.location.host}/rpc`, [
    `${PROTOCOL_PREFIX}${token}`,
  ]);
  await waitForOpen(
    socket,
    AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS),
    "the daemon refused the connection or timed out",
  );
  const client: Client = createORPCClient(new RPCLink({ websocket: socket }));
  current = client;
  bearer = token;
  socket.addEventListener(
    "close",
    () => {
      if (current === client) {
        current = null;
        bearer = null;
      }
    },
    { once: true },
  );
  return { client, socket };
}
