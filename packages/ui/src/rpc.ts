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
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

let current: Client | null = null;

/** The client of the live connection, or null while offline. Panels call RPCs through this. */
export const getClient = (): Client | null => current;

export function connect(token: string): Promise<{ client: Client; socket: WebSocket }> {
  return new Promise((resolve, reject) => {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${window.location.host}/rpc`, [
      `${PROTOCOL_PREFIX}${token}`,
    ]);
    socket.addEventListener(
      "open",
      () => {
        const link = new RPCLink({ websocket: socket });
        const client: Client = createORPCClient(link);
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
        resolve({ client, socket });
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        reject(new Error("the daemon refused the connection"));
      },
      { once: true },
    );
  });
}
