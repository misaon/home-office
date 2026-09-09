import { HANDSHAKE_TIMEOUT_MS, waitForOpen } from "@ho/core";
import type { Contract } from "@ho/protocol";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";

export type Client = ContractRouterClient<Contract>;

const TOKEN_KEY = "ho.token";
const PROTOCOL_PREFIX = "ho.bearer.";

/**
 * The launch URL (`ho ui`) carries the daemon token in the fragment, which browsers never send to the
 * server. It moves into sessionStorage and the fragment is wiped from the address bar and history.
 */
export function resolveToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
  const fromHash = fragment.get("token");
  if (fromHash !== null && fromHash !== "") {
    window.sessionStorage.setItem(TOKEN_KEY, fromHash);
    // The search survives: only the fragment carried the token.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

let current: Client | null = null;

/** The client of the live connection, or null while offline. Panels call RPCs through this. */
export const getClient = (): Client | null => current;

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
  socket.addEventListener(
    "close",
    () => {
      if (current === client) {
        current = null;
      }
    },
    { once: true },
  );
  return { client, socket };
}
