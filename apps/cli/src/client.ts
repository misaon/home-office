import { HANDSHAKE_TIMEOUT_MS, waitForOpen } from "@ho/core";
import { daemonUrl, readDaemonInfo, resolveHome } from "@ho/daemon";
import type { Contract } from "@ho/protocol";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";

export type HoClient = ContractRouterClient<Contract>;

async function connect(): Promise<{ client: HoClient; close: () => void }> {
  const home = resolveHome();
  const info = await readDaemonInfo(home);
  if (info === null) {
    throw new Error(
      `no running daemon found (${home}/daemon.json missing); start one with \`ho daemon\``,
    );
  }
  const websocket = new WebSocket(`${daemonUrl(info, "ws")}/rpc`, {
    headers: { authorization: `Bearer ${info.token}` },
  });
  await waitForOpen(
    websocket,
    AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS),
    `cannot reach the daemon at ${info.host}:${String(info.port)} (pid ${String(info.pid)})`,
  );
  const client: HoClient = createORPCClient(new RPCLink({ websocket }));
  return {
    client,
    close: () => {
      websocket.close();
    },
  };
}

export const withClient = async (fn: (client: HoClient) => Promise<void>): Promise<void> => {
  const { client, close } = await connect();
  try {
    await fn(client);
  } finally {
    close();
  }
};
