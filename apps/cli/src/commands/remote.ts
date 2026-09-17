import type { RemoteStatus } from "@ho/protocol";
import { type Command, output } from "../cli.ts";
import { required, str } from "../flags.ts";
import { colour } from "../output.ts";
import { pick } from "./lookup.ts";

const describe = (status: RemoteStatus): string[] => {
  const link = status.connected
    ? colour.ok(`connected since ${status.connectedAt ?? "?"}`)
    : status.enabled
      ? colour.bad(`not connected${status.lastError === null ? "" : ` (${status.lastError})`}`)
      : colour.dim("off");
  const lines = [
    `remote control ${status.enabled ? colour.ok("on") : colour.dim("off")}  relay ${status.relayUrl ?? colour.dim("not configured")}`,
    `instance ${status.instanceId === null ? colour.dim("(no key yet)") : colour.id(status.instanceId)}  ${link}`,
  ];
  for (const device of status.devices) {
    const state =
      device.revokedAt !== null
        ? colour.bad("revoked")
        : device.online
          ? colour.ok("online")
          : colour.dim("offline");
    lines.push(
      `${colour.id(device.id)}  ${device.name.padEnd(16)}  ${state}  paired ${device.pairedAt.slice(0, 10)}  last seen ${device.lastSeenAt ?? "never"}`,
    );
  }
  for (const pairing of status.pairings) {
    lines.push(
      `pairing ${colour.id(pairing.id)} for ${pairing.name} open until ${pairing.expiresAt}`,
    );
  }
  return lines;
};

export const remoteCommand: Command = {
  name: "remote",
  summary: "control the office from a phone through a relay: status, on, off, pair, revoke",
  subcommands: {
    status: {
      run: async (_parsed, client) => {
        const rpc = await client();
        const status = await rpc.remote.status();
        return output(describe(status), status);
      },
    },
    on: {
      strings: { relay: "wss://relay.example.com/relay" },
      required: ["relay"],
      run: async (parsed, client) => {
        const rpc = await client();
        const status = await rpc.remote.configure({
          enabled: true,
          relayUrl: required(parsed, "relay"),
        });
        return output(describe(status), status);
      },
    },
    off: {
      run: async (_parsed, client) => {
        const rpc = await client();
        const status = await rpc.remote.configure({ enabled: false });
        return output(describe(status), status);
      },
    },
    pair: {
      strings: { name: "device name" },
      run: async (parsed, client) => {
        const rpc = await client();
        const pairing = await rpc.remote.pair({ name: str(parsed, "name") });
        return output(
          [
            `pairing code, valid until ${pairing.expiresAt} and usable once:`,
            "",
            `  ${colour.bold(pairing.code)}`,
            "",
            `enter it in a Home Office remote client that talks to ${pairing.relayUrl ?? "the relay"}`,
          ],
          pairing,
        );
      },
    },
    revoke: {
      positionals: ["<device>"],
      run: async (parsed, client) => {
        const rpc = await client();
        const current = await rpc.remote.status();
        const device = pick(current.devices, parsed.positionals[0] ?? "", "device");
        const status = await rpc.remote.revoke({ deviceId: device.id });
        return output([`${device.name} (${device.id}) revoked`, ...describe(status)], status);
      },
    },
  },
};
