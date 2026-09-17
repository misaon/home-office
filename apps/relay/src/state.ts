import type { RelayToClient } from "@ho/protocol";
import type { Bytes } from "@ho/remote";

export type RelaySocket = {
  send: (text: string) => void;
  close: (code: number, reason: string) => void;
};

export type RelayLog = {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
};

type PeerKind = "device" | "pairing";
export type Peer = { id: string; kind: PeerKind; socket: RelaySocket };
export type Instance = {
  id: string;
  socket: RelaySocket;
  revoked: Set<string>;
  pairings: Map<string, number>;
  peers: Map<string, Peer>;
};
type Role =
  | { kind: "pending" }
  | { kind: "instance"; id: string }
  | { kind: "peer"; instanceId: string; peerId: string };
export type Connection = { nonce: Bytes; role: Role; windowStart: number; frames: number };

export const CLOSE_NORMAL = 1000;
export const CLOSE_GOING_AWAY = 1001;
export const CLOSE_POLICY = 1008;

export const send = (socket: RelaySocket, frame: RelayToClient): void => {
  socket.send(JSON.stringify(frame));
};
